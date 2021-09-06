const fetch = require("isomorphic-fetch");
// For HTML scraping
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

class scrapeHelper {
  constructor(asin) {
    this.asin = asin;
    this.reqUrl = this.buildUrl(asin);
  }
  /**
   *
   * @param {string} ASIN The Audible ID to base the URL on
   * @returns {string} full url to fetch.
   */
  buildUrl(ASIN) {
    let baseUrl = "https://www.audible.com/pd";
    let reqUrl = `${baseUrl}/${ASIN}`;
    return reqUrl;
  }

  /**
   *
   * @param {buildUrl} reqUrl the full url to fetch.
   * @returns {json} data from parseResponse() function.
   */
  async fetchBook() {
    try {
      let response = await fetch(this.reqUrl);
      let text = await response.text();
      let dom = await new JSDOM(text);
      return this.parseResponse(dom);
    } catch (err) {
      return err;
      // console.log(err);
    }
  }

  /**
   *
   * @param {JSDOM} dom the fetched dom object
   * @returns {json} genre and series.
   */
  parseResponse(dom) {
    let returnJson = {};

    // Genres
    let genres = dom.window.document.querySelectorAll("li.categoriesLabel a");
    if (genres) {
      let genreArr = [];

      // Check parent genre
      if (genres[0]) {
        genreArr.push({
          name: genres[0].textContent,
          id: this.getAsinFromUrl(genres[0].getAttribute("href")),
          type: "parent",
        });
      }
      // Check child genre
      if (genres[1]) {
        genreArr.push({
          name: genres[1].textContent,
          id: this.getAsinFromUrl(genres[1].getAttribute("href")),
          type: "child",
        });
      }

      returnJson.genres = genreArr;
    }

    // Series
    let series = dom.window.document.querySelectorAll("li.seriesLabel a");
    let seriesRaw =
      dom.window.document.querySelector("li.seriesLabel").innerHTML;
    if (series) {
      let seriesArr = [];
      let book_pos = this.getBookFromHTML(seriesRaw);

      if (series[0]) {
        seriesArr.push({
          name: series[0].textContent,
          id: this.getAsinFromUrl(series[0].getAttribute("href")),
          position: book_pos[0],
        });
      }
      if (series[1]) {
        seriesArr.push({
          name: series[1].textContent,
          id: this.getAsinFromUrl(series[1].getAttribute("href")),
          position: book_pos[1],
        });
      }

      returnJson.series = seriesArr;
    }

    return returnJson;
  }

  // Helpers
  /**
   *
   * @param {string} url string to extract ASIN from
   * @returns {string} ASIN.
   */
  getAsinFromUrl(url) {
    const asinRegex = /[0-9A-Z]{9}.+?(?=\?)/gm;
    const ASIN = url.match(asinRegex)[0];
    return ASIN;
  }

  /**
   *
   * @param {jsdom} html block/object to retrieve book number from.
   * @returns {string} Cleaned book position string, like "Book 3"
   */
  getBookFromHTML(html) {
    const bookRegex = /(Book [+-]?(\d*\.)?\d+)/gm;
    const matches = html.match(bookRegex);
    return matches;
  }
}

module.exports = scrapeHelper;
