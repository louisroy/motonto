// Load environment variables
require('dotenv').load();

// Required modules
var _ = require('underscore');
var async = require('async');
var kijiji = require('kijiji-scraper');
var spreadsheet = require("google-spreadsheet");
var express = require('express');
var app = express();

// Globals
var sheet, creds, locations, categories, minPrice, maxPrice, existingGuids;

// Web application
app.get('/', function (req, res) {
	initialize(function(err, writtenAds) {
		if (err) {
			// Something happened, display error
			res.status(500).send("An error occured : " + err.message);
		} else {
			// Ads were fetched successfully
			res.status(200).send("Successfully added " + writtenAds + " ads to spreadsheet.");
		}
	});
});

// Server
var server = app.listen(process.env.PORT || 5000, function () {
	var host = server.address().address;
	var port = server.address().port;
	
	console.log('App listening at http://%s:%s', host, port);
});

/**
 * Initializes the app
 * @param callback
 */
var initialize = function(callback) {
	callback = callback || function() {};
	
	// Search paramaters
	minPrice = process.env.MIN_PRICE;
	maxPrice = process.env.MAX_PRICE;
	locations = process.env.LOCATION_IDS.split(','); // Toronto
	categories = process.env.CATEGORY_IDS.split(','); // Motorcycles
	
	// Reset array
	existingGuids = [];
	
	// Google spreadsheet
	sheet = new spreadsheet(process.env.SPREADSHEET_KEY);
	creds = {
		client_email:process.env.CLIENT_EMAIL,
		private_key:process.env.PRIVATE_KEY
	};
	
	// Waterfall process
	async.waterfall([
		authenticate,
		analyze,
		fetch,
		write
	], callback);
};

/**
 * Authenticates to Google API and makes sure we can write to spreasheet
 * @param callback
 */
var authenticate = function(callback) {
	sheet.useServiceAccountAuth(creds, function(err) {
		if (err) return callback(err);
		
		sheet.getInfo(function(err, sheetInfo) {
			if (err) return callback(err);
			
			return callback(null, sheetInfo)
		});
	});
};

/**
 * Analyzes current spreadsheet and fetches all existing GUIDs for future use
 * @param sheetInfo
 * @param callback
 */
var analyze = function(sheetInfo, callback) {
	// TODO : should fetch last 1000 rows and of first
	// TODO : min-col and max-col should be dynamic (last column)
	sheet.getCells(1, { 'min-row':1, 'max-row':1000, 'min-col':9, 'max-col':9 }, function(err, cells) {
		if (err) return callback(err);
		
		// Loop through all cells to fetch GUIDs
		_.each(cells, function(cell) {
			existingGuids.push(cell.value);
		});
		
		return callback(null, existingGuids);
	});
};

/**
 * Prepares search requests for all search parameters
 * @param guids
 * @param callback
 */
var fetch = function(guids, callback) {
	var tasks = [];
	
	// For each location and category, add a task
	_.each(locations, function(locationId) {
		_.each(categories, function(categoryId) {
			tasks.push(function(taskCallback) {
				scrape(locationId, categoryId, taskCallback);
			});
		});
	});
	
	// Run fetching tasks in parallel
	async.parallel(tasks, function(err, adGroups) {
		if (err) return callback(err);
		
		// Flatten array
		var ads = [];
			ads = ads.concat.apply(ads, adGroups);
		
		// Return flattened ads
		callback(null, ads);
	});
};

/**
 * Scrapes Kijiji ads for a location and a category
 * @param locationId
 * @param categoryId
 * @param callback
 */
var scrape = function(locationId, categoryId, callback) {
	console.log('Fetching category #%s for location #%s', locationId, categoryId);
	
	// Search query
	var prefs = {
		locationId:locationId,
		categoryId:categoryId
	};
	
	// Search parameters
	var params = {
		minPrice:minPrice,
		maxPrice:maxPrice,
		adType:'OFFER'
	};

	kijiji.query(prefs, params, function(err, ads) {
		if (err) return callback(err);
		
		// Return ads
		callback(null, ads);
	});
};

/**
 * Writes ads to the spreadsheet
 * @param ads
 * @param callback
 */
var write = function(ads, callback) {
	// Total number of ads
	var totalAds = ads.length;
	
	// Number of ads written to spreadsheet
	var writtenAds = 0;
	
	// Event handler
	var onProgress = function() {
		// Check if we have written as much as we have
		if (writtenAds >= totalAds) {
			callback(null, writtenAds);
		}
	};
	
	// Loop through each ads
	_.each(ads, function(ad, index, list) {
		// Skip ads that are already in the spreadsheet
		if (existingGuids.indexOf(ad.guid) !== -1) {
			totalAds--;
			return onProgress();
		}
		
		// Prepare data
		// TODO : data structure should be dynamic
		var row = {
			guid:ad.guid,
			title:ad.title,
			date:ad['dc:date'],
			price:parseFloat(ad.innerAd.info['Price'].replace(/\$|,/g, '')),
			colour:ad.innerAd.info['Colour'],
			kilometers:ad.innerAd.info['Kilometers'],
			make:ad.innerAd.info['Make'],
			model:ad.innerAd.info['Model'],
			year:parseInt(ad.innerAd.info['Year']),
			engine:parseInt(ad.innerAd.info['Engine Displacement (cc)'])
		};
		
		// TODO : create header if non-existent?
		
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