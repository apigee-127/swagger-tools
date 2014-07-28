/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var _ = require('lodash');
var swaggerMetadata = require('../middleware/swagger-metadata');

module.exports.createServer = function createServer (resourceList, resources, middlewares, handler) {
  var app = require('connect')();
  var bodyParser = require('body-parser');
  var parseurl = require('parseurl');
  var qs = require('qs');

  // Required middleware
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(function (req, res, next) {
    if (!req.query) {
      req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
    }

    return next();
  });

  app.use(swaggerMetadata(resourceList, resources));

  _.each(middlewares || [], function (middleware) {
    app.use(middleware);
  });

  if (handler) {
    app.use(handler);
  } else {
    app.use(function(req, res){
      res.end('OK');
    });
  }

  return app;
};

module.exports.prepareText = function prepareText (text) {
  return text.replace(/&nbsp;/g, ' ').replace(/\n/g, '');
};
