const puppeteer = require(`puppeteer`);
const cron = require(`node-cron`)
const mysql = require(`mysql`)
const fs = require(`fs`)
const utils = require(`./`)

const BASEURL = 'https://persol-tech-s.co.jp/jobsearch/result/A1knt/A2tky_A2kng_A2cba_A2sit/J2apdev/';

const connection = mysql.createConnection({
  host: `scraping_db`,
  user: `puppeteer`,
  password: `puppeteer`,
  database: `test_db`
})

connection.connect((err) => {
  console.log(`connected. id is ${connection.threadId}`)
  if(err) {
    console.error(`connection error: ${err.stack}`)
  }
})

const getNumberOfResults = async page => {
  const results = await page.$(`#workTop > form > div > div.p-sort-clm > p`)
  const textContent = await (await results.getProperty(`textContent`)).jsonValue()
  const strLength = textContent.length
  const numberOfResults = Number(textContent.split('検索結果')[1].split('件')[0])
  return numberOfResults
}

const createDisplayUrl = async numberOfResults => {
  const displayCount = numberOfResults
  const displayUrl = BASEURL + `?displayCount=${numberOfResults}`
  console.log(displayUrl)
  return displayUrl
}

const getUrls = async (page, displayUrl) => {
  await page.goto(displayUrl)
  const urls = await page.$$(`.p-job-card__ttl-link`)
  const urlList = []
  for (url of urls) {
    const element = await url
    const href = await (await url.getProperty(`href`)).jsonValue()
    urlList.push(href)
  } 
  return urlList
}

const titleScrape = async page => {
  const titleDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[1]/div/h3`)
  const title = await page.evaluate(titleDOM => titleDOM.textContent, titleDOM[0])
  const trimedTitle = title.replace(/\s+/g, ``)
  return trimedTitle
}

const salaryScrape = async page => {
  const salaryDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[1]/td`)
  const salary = await page.evaluate(salaryDOM => salaryDOM.textContent, salaryDOM[0])
  const trimedSalary = salary.replace(/\時給/g, ``).replace(/\円/g, ``).replace(/\～/g, ',')
  const salaryArray = trimedSalary.split(',')
  return salaryArray
}

const placeScrape = async page => {
  const placeDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[4]/td`)
  const place = await page.evaluate(placeDOM => placeDOM.textContent, placeDOM[0])
  const trimedPlace = place.split(` `)
  const placeArray = []
  let count = 0
  for (let i = 0; i < trimedPlace.length; i++) {
    trimedPlace[i] = trimedPlace[i].replace(/\s+/g, ``).replace(/\n/g, ``)
    if (trimedPlace[i] && trimedPlace[i] !== ' ' && trimedPlace[i] !== '\n') {
      placeArray.push(trimedPlace[i])
      count++
      if (count > 1) break
    }
  }
  return placeArray
}

const workScrape = async page => {
  const workDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[5]/td`)
  const workInnerHTML = await page.evaluate(workDOM => workDOM.innerHTML, workDOM[0])
  const work = workInnerHTML.replace(/\<br>/g, `\n`)
  return work
}

const timeScrape = async page => {
  const timeDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[7]/td`)
  const timeInnerHTML = await page.evaluate(timeDOM => timeDOM.innerHTML, timeDOM[0])
  const timeReplace = timeInnerHTML.replace(/\<br>/g, `\n`)
  const timeSplit = timeReplace.split(`)`)[1].split(`(`)[0]
  const timeOverWork = timeReplace.split(`\n`)[1].split(`月`)[1]
  const timeArray = [timeSplit, timeOverWork]
  return timeArray
}

const otherScrape = async page => {
  const cond = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[12]/td`)
  if (cond.length !== 0){
    const otherDOM = await page.$x(`//*[@id="workDetail"]/form/div[1]/div/section/div[3]/table[2]/tbody/tr[10]/td`)
    const otherInnerHTML = await page.evaluate(otherDOM => otherDOM.innerHTML, otherDOM[0])
    const other = otherInnerHTML.replace(/\<br>/g, `\n`)
    return other
  } else {
    return 'No information.'
  }
}

const scrapePage = async (browser, n, urls) => {
  const page = await browser.newPage()
  await page.goto(urls[n])

  const scrapeObj = {
    title: await titleScrape(page),
    salaryArray: await salaryScrape(page),
    placeArray: await placeScrape(page),
    work: await workScrape(page),
    timeArray: await timeScrape(page),
    other: await otherScrape(page)
  }
  await page.close()
  console.log(n)
  return scrapeObj
}

const pararelScrape = async (browser, urls, numberOfResults) => {
  const results = []
  const test = numberOfResults - 10
  for (let i = test; i < numberOfResults; i+=3) {
    if (numberOfResults - i < 3) {
      var remain = i
      break
    }
    const p1 = scrapePage(browser, i, urls)
    const p2 = scrapePage(browser, i+1, urls)
    const p3 = scrapePage(browser, i+2, urls)
    const [p1a, p2a, p3a] = await Promise.all([p1, p2, p3])
    results.push(p1a)
    results.push(p2a)
    results.push(p3a)
  }
  for (let i = remain; i < numberOfResults; i++) {
    const p = await scrapePage(browser, i, urls)
    results.push(p)
  }
  return results
}

cron.schedule(`* * * * *`, () => {
( async () => {
    const browser = await puppeteer.launch({
      args: [`--no-sandbox`, `--disable-setuid-sandbox`],
      headless: true
    })
    const page = await browser.newPage()
    await page.goto(BASEURL)

    const numberOfResults = await getNumberOfResults(page)
    const displayUrl = await createDisplayUrl(numberOfResults)
    const urls = await getUrls(page, displayUrl)

    const results = await pararelScrape(browser, urls, numberOfResults)
    
    await browser.close()
    console.log(results.length)
  }
)()
  .catch(e => { console.error(e) })
})