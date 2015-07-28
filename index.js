// Load environment variables
require('dotenv').load();

// Required modules
var _ = require('underscore');
var async = require('async');
var kijiji = require('kijiji-scraper');
var GoogleSpreadsheet = require("google-spreadsheet");
var express = require('express');
var app = express();

// Globals
var sheet, creds, locations, categories,existingGuids;

// Web server
app.get('/', function (req, res) {
	initializeScraper();
	res.send('Hello World!');
});

var server = app.listen(process.env.PORT || 5000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});

var initializeScraper = function() {
	locations = process.env.LOCATION_IDS.split(','); // Toronto
	categories = process.env.CATEGORY_IDS.split(','); // Motorcycles
	existingGuids = [];
	
	sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_KEY);
	creds = {
		client_email:process.env.CLIENT_EMAIL,
		private_key:process.env.PRIVATE_KEY
	};
	
	sheet.useServiceAccountAuth(creds, function(err) {
		if (err) {
			return console.log(err);
		}
		
		sheet.getInfo(fetchExistingGuids);
	});
}

var fetchExistingGuids = function(err, sheetInfo) {
	if (err) {
		return console.log(err);
	}
	
	sheet.getCells(1, { 'min-row':1, 'max-row':1000, 'min-col':8, 'max-col':8 }, function(err, cells) {
		if (err) {
			return console.log(err);
		}
		
		_.each(cells, function(cell) {
			existingGuids.push(cell.value);
		});
		
		fetchAllAds();
	});
}

var fetchAllAds = function() {
	_.each(locations, function(locationId) {
		_.each(categories, function(categoryId) {
			fetchAds(locationId, categoryId);
		});
	});
}

var fetchAds = function(locationId, categoryId) {
	console.log('Fetching category #%s for location #%s, locationId, categoryId');
	
	var prefs = {
		locationId:locationId,
		categoryId:categoryId
	};
	
	var params = {
		minPrice:1000,
		maxPrice:4000,
		adType:'OFFER'
	};

	kijiji.query(prefs, params, function(err, ads) {
		if (err) {
			return console.log(err);
		}
		
		writeToFile(ads);
	});
}

var writeToFile = function(ads) {
	_.each(ads, function(ad, index, list) {
		if (existingGuids.indexOf(ad.guid) !== -1) {
			return console.log('found existing guid');
		}
		
		var row = {
			guid:ad.guid,
			title:ad.title,
			date:ad['dc:date'],
			price:ad.innerAd.info.Price,
			colour:ad.innerAd.info.Colour,
			kilometers:ad.innerAd.info.Kilometers,
			make:ad.innerAd.info.Make,
			model:ad.innerAd.info.Model,
			year:ad.innerAd.info.Year,
		};
		
		for (var key in row) {
			if (row[key] == null) {
				return true;
			}
		}
		
		sheet.addRow(1, row, function(err) {
			if (err) {
				return console.log(err);
			}
			
			console.log('successfully added row' );
		});
	});
	
	console.log('finished process' );
}