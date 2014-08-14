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
var swagger = require('../');

module.exports.createServer = function createServer (middlewareArgs, middlewares, handler) {
  var swaggerMetadata;
  var app = require('connect')();
  var bodyParser = require('body-parser');
  var parseurl = require('parseurl');
  var qs = require('qs');

  switch (middlewareArgs.length) {
  case 2:
    swaggerMetadata = swagger.middleware.v1_2.swaggerMetadata; // jshint ignore:line
    break;

  case 1:
    swaggerMetadata = swagger.middleware.v2_0.swaggerMetadata; // jshint ignore:line
    break;

  default:
    throw new Error('Unsupported version: ' + version);
  }

  // Required middleware
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(function (req, res, next) {
    if (!req.query) {
      req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
    }

    return next();
  });

  app.use(swaggerMetadata.apply(swaggerMetadata, middlewareArgs));

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
