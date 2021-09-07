const fetch = require("isomorphic-fetch");
// For merchandising_summary
const { htmlToText } = require("html-to-text");

class apiHelper {
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
        let baseUrl = "https://api.audible.com/1.0/catalog/products";
        let resGroups =
            "?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media";
        let reqUrl = `${baseUrl}/${ASIN}/${resGroups}`;
        return reqUrl;
    }

    /**
     *
     * @param {scraperUrl} reqUrl the full url to fetch.
     * @returns {JSON} response from Audible API
     */
    async fetchBook() {
        try {
            let response = await fetch(this.reqUrl);
            let json = await response.json();
            // console.log(json);
            return this.parseResponse(json);
        } catch (err) {
            return err;
            // console.log(err);
        }
    }

    /**
     *
     * @param {json} jsonRes fetched json response from api.audible.com
     * @returns {json} relevant data to keep
     */
    parseResponse(jsonRes) {
        let inputJson = jsonRes.product;
        let finalJson = {};

        const keysToKeep = [
            "asin",
            "title",
            "subtitle",
            "merchandising_summary",
            "publisher_summary",
            "authors",
            "narrators",
            "publication_name",
            "release_date",
            "publisher_name",
            "language",
            "runtime_length_min",
            "format_type",
            "product_images",
        ];

        keysToKeep.forEach((key) => {
            // Clean short description of html tags
            if (key == "merchandising_summary") {
                finalJson["short_summary"] = htmlToText(inputJson[key], {
                    wordwrap: false,
                });
            }

            // Narrators and authors both come in array objects
            else if (key == "authors" || key == "narrators") {
                let peopleArr = [];
                inputJson[key].forEach((person) => {
                    let asin = person.asin;
                    let name = person.name;
                    let personJson = {};

                    // Use asin for author if available
                    if (asin) {
                        personJson.asin = asin;
                    }
                    personJson.name = name;
                    peopleArr.push(personJson);
                });
                // Use final array as value
                inputJson[key] = peopleArr;
            }

            // Make it into a date object
            else if (key == "release_date") {
                finalJson[key] = Date.parse(inputJson[key]);
            }

            // Remove _SL500_
            else if (key == "product_images") {
                finalJson["cover_image"] = inputJson[key][500].replace(
                    "_SL500_.",
                    ""
                );
            }

            // Common case
            else if (inputJson[key]) {
                finalJson[key] = inputJson[key];
            }
        });

        return finalJson;
    }
}

module.exports = apiHelper;
