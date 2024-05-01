import puppeteer, { Page } from 'puppeteer';
import 'dotenv/config'
import Credentials from './types/credentials';
import parseArchives from './parsers/archives';
import parseCurrent from './parsers/current';
import fs from 'fs'
import { callWebhook } from './utils/discordInteractions';

function getInformations(): Credentials {
  return { email: process.env.EMAIL, password: process.env.PASSWORD, webhook: process.env.WEBHOOK_URL }
}

async function navigateToGenote(page: Page, user: Credentials) {
  if (user.email === undefined || user.password === undefined) {
    throw new Error('You must provide an email and a password in the .env file')
  }

  // Navigate the page to a URL
  await page.goto('https://cas.usherbrooke.ca/login?service=https%3A%2F%2Fwww.usherbrooke.ca%2Fgenote%2Fpublic%2Findex.php');

  // Type into search box
  await page.type('#username', user.email);
  await page.type('#password', user.password);

  // Wait and click on first result
  const searchResultSelector = '.btn-submit'
  await page.waitForSelector(searchResultSelector);

  await Promise.all([
    page.click(searchResultSelector),
    page.waitForNavigation()
  ])
}

async function main() {
  let user: Credentials = getInformations()
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1024 });

  await navigateToGenote(page, user);

  await page.goto('https://www.usherbrooke.ca/genote/application/etudiant/cours.php');

  let resultCurrent = await parseCurrent(page);
  if (resultCurrent.length === 0) {
    resultCurrent = await parseArchives(page, 5);
  }

  try {
    let file = fs.readFileSync('result.json');
    let oldResults = JSON.parse(file.toString())
    for (let i = 0; i < resultCurrent.length; i++) {
      let newResult = resultCurrent[i];
      let oldResult = oldResults[i];

      if (newResult.emptyNoteAmount != oldResult.emptyNoteAmount ||
        newResult.evaluationAmount != oldResult.evaluationAmount) {
        console.log(`Changes detected in ${newResult.name}`)
        callWebhook(user?.webhook || "", `**Nouvelle note en ${newResult.name} est disponible**`)
      }
    }
  }
  catch (e) {
    fs.writeFileSync('result.json', '[]')
  }

  fs.writeFileSync('result.json', JSON.stringify([...resultCurrent], null, 2))

  await browser.close();
}

main();