// Load environment variables
require('dotenv').load();

// Required modules
var _ = require('underscore');
var kijiji = require('kijiji-scraper');
var GoogleSpreadsheet = require("google-spreadsheet");

var sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_KEY);
var creds = {
	client_email:process.env.CLIENT_EMAIL,
	private_key:process.env.PRIVATE_KEY
};

var locationId = 1700273; // Toronto
var categoryId = 30; // Motorcycles

sheet.useServiceAccountAuth(creds, function(err) {
	sheet.getInfo(function(err, sheetInfo){
		fetchAds();
	});
});

var fetchAds = function() {
	var prefs = {
		locationId:locationId,
		categoryId:categoryId
	};
	
	var params = {
		minPrice:0,
		maxPrice:1000,
		adType:'OFFER'
	};

	kijiji.query(prefs, params, function(err, ads) {
		writeToFile(ads);
	});
}

var writeToFile = function(ads) {
	_.each(ads, function(ad, index, list) {
		var row = {
			guid:ad.guid,
			title:ad.title,
			price:ad.innerAd.info.Price,
			colour:ad.innerAd.info.Colour,
			kilometers:ad.innerAd.info.Kilometers,
			make:ad.innerAd.info.Make,
			model:ad.innerAd.info.Model,
			year:ad.innerAd.info.Year,
		};
		
		for (var key in row) {
			if (row[key] == null) {
				console.log('null found', row);
				return true;
			}
		}
		
		sheet.addRow(1, row);
	});
}