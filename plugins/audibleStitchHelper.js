class stitchHelper {
    constructor(apiRes, htmlRes) {
        this.apiRes = apiRes;
        this.htmlRes = htmlRes;
        this.finalJson = apiRes;
    }

    includeGenres() {
        this.finalJson.genres = this.htmlRes.genres;
    }

    setSeriesOrder() {
        let htmlSeries = this.htmlRes.series;
        let returnJson = this.finalJson;

        // If multiple series, set one with publication_name as primary
        if (htmlSeries.length > 1) {
            htmlSeries.forEach((item) => {
                if (item.name == this.apiRes.publication_name) {
                    returnJson.primary_series = item;
                } else {
                    returnJson.secondary_series = item;
                }
            });
        } else {
            returnJson.primary_series = htmlSeries[0];
        }

        delete returnJson.publication_name;
    }

    process() {
        this.includeGenres();
        this.setSeriesOrder();
        console.log(this.finalJson);
        return this.finalJson;
    }
}

module.exports = stitchHelper;
