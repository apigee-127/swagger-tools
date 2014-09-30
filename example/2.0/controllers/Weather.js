'use strict';

var weather = require('weather-js');

module.exports.getWeather = function getWeather (req, res, next) {
  var location = req.swagger.params.location.value;
  var unit = req.swagger.params.unit.value;

  // This is only here due to the bug mentioned above and is not a bug/limitation of swagger-tools
  // https://github.com/apigee-127/swagger-tools/blob/master/docs/QuickStart.md#upstream-bug
  if (['C', 'F'].indexOf(unit) === -1) {
    res.statusCode = 400;
    res.end('unit must be either C or F');
  }

  // Code necessary to consume the Weather API and respond
  weather.find({search: location, degreeType: unit}, function(err, result) {
    if (err) {
      console.log(err.stack);
      return next(err.message);
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result[0] || {}, null, 2));
  });
};
