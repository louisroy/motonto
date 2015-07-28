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
	init(function(err, result) {
		res.send('Hello World!');
	});
});

var server = app.listen(process.env.PORT || 5000, function () {
	var host = server.address().address;
	var port = server.address().port;
	
	init(function(err, writtenAds) {
		console.log("Successfully added %s ads to spreadsheet.", writtenAds);
	});
	
	console.log('Example app listening at http://%s:%s', host, port);
});

var init = function(callback) {
	callback = callback || function() {};
	
	locations = process.env.LOCATION_IDS.split(','); // Toronto
	categories = process.env.CATEGORY_IDS.split(','); // Motorcycles
	existingGuids = [];
	
	sheet = new GoogleSpreadsheet(process.env.SPREADSHEET_KEY);
	creds = {
		client_email:process.env.CLIENT_EMAIL,
		private_key:process.env.PRIVATE_KEY
	};
	
	async.waterfall([
		authenticate,
		fetchExistingGuids,
		fetchAllAds,
		writeAds
	], callback);
};

var authenticate = function(callback) {
	sheet.useServiceAccountAuth(creds, function(err) {
		if (err) return callback(err);
		
		sheet.getInfo(function(err, sheetInfo) {
			if (err) return callback(err);
			
			return callback(null, sheetInfo)
		});
	});
};

var fetchExistingGuids = function(sheetInfo, callback) {
	sheet.getCells(1, { 'min-row':1, 'max-row':1000, 'min-col':9, 'max-col':9 }, function(err, cells) {
		if (err) return callback(err);
		
		_.each(cells, function(cell) {
			existingGuids.push(cell.value);
		});
		
		return callback(null, existingGuids);
	});
};

var fetchAllAds = function(guids, callback) {
	var tasks = [];
	
	_.each(locations, function(locationId) {
		_.each(categories, function(categoryId) {
			tasks.push(function(taskCallback) {
				fetchAds(locationId, categoryId, taskCallback);
			});
		});
	});
	
	// Run fetching tasks in parallel
	async.parallel(tasks, function(err, adGroups) {
		if (err) return callback(err);
		
		// Flatten array
		var ads = [];
			ads = ads.concat.apply(ads, adGroups);
		
		callback(null, ads);
	});
};

var fetchAds = function(locationId, categoryId, callback) {
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
		if (err) return callback(err);
		
		callback(null, ads);
	});
};

var writeAds = function(ads, callback) {
	var totalAds = ads.length;
	var writtenAds = 0;
	var onProgress = function() {
		if (writtenAds >= totalAds) {
			callback(null, writtenAds);
		}
	};
	
	_.each(ads, function(ad, index, list) {
		// Check if ad is already in spreadsheet
		if (existingGuids.indexOf(ad.guid) !== -1) {
			totalAds--;
			return onProgress();
		}
		
		// Prepare data
		var row = {
			guid:ad.guid,
			title:ad.title,
			date:ad['dc:date'],
			price:ad.innerAd.info['Price'],
			colour:ad.innerAd.info['Colour'],
			kilometers:ad.innerAd.info['Kilometers'],
			make:ad.innerAd.info['Make'],
			model:ad.innerAd.info['Model'],
			year:parseInt(ad.innerAd.info['Year']),
			engine:parseInt(ad.innerAd.info['Engine Displacement (cc)'])
		};
		
		// Filter out ads with missing info
		for (var key in row) {
			if (row[key] == null) {
				totalAds--;
				return onProgress();
			}
		}
		
		// Additional filter, engine must be >= 500 <= 1100
		if (row.engine < 500 || row.engine > 1100) {
			totalAds--;
			return onProgress();
		}
		
		// Add ad to spreasheet
		sheet.addRow(1, row, function(err) {
			if (err) {
				totalAds--;
				
				// TODO : Trigger callback?
			} else {
				writtenAds++;
			}
			
			return onProgress();
		});
	});
};