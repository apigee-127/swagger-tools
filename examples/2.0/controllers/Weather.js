'use strict';

var weather = require('weather-js');

module.exports.getWeather = function getWeather (req, res, next) {
  // Code necessary to consume the Weather API and respond
  weather.find({
    search: req.swagger.params.location.value,
    degreeType: req.swagger.params.unit.value + '&&src=outlook' // Hack to work around API changes (Need new API)
  }, function(err, result) {
    if (err) {
      console.log(err.stack);
      return next(err.message);
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result[0] || {}, null, 2));
  });
};
