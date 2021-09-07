"use strict";
const apiHelper = require("../helpers/audibleApi");
const scrapeHelper = require("../helpers/audibleScrape");
const stitchHelper = require("../helpers/audibleStitch");
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
    methods: {},

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
