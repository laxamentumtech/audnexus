"use strict";
const apiHelper = require("../helpers/audibleApi");
const scrapeHelper = require("../helpers/audibleScrape");
const stitchHelper = require("../helpers/audibleStitch");

const { MoleculerError } = require("moleculer").Errors;
/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
    name: "book",

    /**
     * Settings
     */
    settings: {},

    /**
     * Dependencies
     */
    dependencies: [],

    /**
     * Actions
     */
    actions: {
        getBook: {
            rest: {
                method: "GET",
                path: "/",
            },
            params: {
                asin: "string",
            },
            cache: {
                ttl: 86400,
            },
            /** @param {Context} ctx  */
            async handler(ctx) {
                if (!this.checkAsinValidity(ctx.params.asin)) {
                    throw new MoleculerError("Bad ASIN", 400);
                }

                const api = new apiHelper(ctx.params.asin);
                const scraper = new scrapeHelper(ctx.params.asin);

                // Fetch both api and html at same time
                const listOfPromises = [api.fetchBook(), scraper.fetchBook()];
                return await Promise.all(listOfPromises).then((res) => {
                    const stitch = new stitchHelper(res[0], res[1]);
                    return stitch.process();
                });
            },
        },
    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {
        /**
         *
         * @param {string} asin string to extract ASIN from
         * @returns {string} ASIN.
         */
        checkAsinValidity(asin) {
            const asinRegex = /[0-9A-Z]{10}/gm;

            let match = asin.match(asinRegex);
            if (match) {
                return true;
            }
            return false;
        },
    },

    /**
     * Service created lifecycle event handler
     */
    created() {},

    /**
     * Service started lifecycle event handler
     */
    async started() {},

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {},
};
