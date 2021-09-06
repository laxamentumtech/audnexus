const apiHelper = require("./plugins/audibleApiHelper");
const scrapeHelper = require("./plugins/audibleScrapeHelper");
const stitchHelper = require("./plugins/audibleStitchHelper");

// For now, testing uses static asin
let ASIN = "0593103629";

/**
 *
 * @returns (0) JSON api resonse, (1) JSON with series and genres.
 */
async function fetchData() {
  const api = new apiHelper(ASIN);
  const scraper = new scrapeHelper(ASIN);

  // Fetch both api and html at same time
  const listOfPromises = [api.fetchBook(), scraper.fetchBook()];
  return await Promise.all(listOfPromises).then((res) => {
    const stitch = new stitchHelper(res[0], res[1]);
    return stitch.process();
  });
}

fetchData();
