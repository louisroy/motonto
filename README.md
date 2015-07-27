# Motonto

Fetches Kijiji ads stores them into a Google Spreadsheet.

## Installation

Install Node.js on [your platform](http://nodejs.org/download/).

Install dependencies : ```npm install```

## Usage

Rename .env.sample to .env and edit with your own values.

### Google Spreadsheet

Create a [Google Service account](https://www.npmjs.com/package/google-spreadsheet#service-account-recommended-method).

### Kijiji

Browse Kijiji and gather the needed location id(s) and category id(s).

#### Example

URL : ```http://www.kijiji.ca/b-motorcycles/city-of-toronto/c30l1700273```

Last segment : ```c30l1700273```

Category ID : ```301```

Location ID : ```700273```
