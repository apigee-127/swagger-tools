/* global describe, it */

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

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = require('lodash');
var assert = require('assert');
var middleware = require('../middleware/swagger-router');
var path = require('path');
var request = require('supertest');
var helpers = require('./helpers');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

var testResourceList = {};
var testResources = [
  {
    apis: [
      {
        path: '/users/{id}',
        operations: [
          {
            method: 'GET',
            nickname: 'Users_getById',
            type: 'string'
          }
        ]
      },
      {
        path: '/pets/{id}',
        operations: [
          {
            method: 'GET',
            nickname: 'Pets_getById',
            type: 'string'
          }
        ]
      }
    ]
  },
  // Duplicate of the previous resource but with a basePath
  {
    apis: [
      {
        path: '/users/{id}',
        operations: [
          {
            method: 'GET',
            nickname: 'Users_getById',
            type: 'string'
          }
        ]
      },
      {
        path: '/pets/{id}',
        operations: [
          {
            method: 'GET',
            nickname: 'Pets_getById',
            type: 'string'
          }
        ]
      }
    ],
    basePath: 'http://localhost/api/v1'
  }
];
var optionsWithControllersDir = {
  controllers: path.join(__dirname, 'controllers')
};

describe('Swagger Router Middleware', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'options.controllers values must be functions': {
        controllers: {
          'Users_getById': 'NotAFunction'
        }
      }
    };
    var controllersPath = path.join(__dirname, 'bad-controllers');
    var usersControllerPath = path.join(controllersPath, 'Users.js');

    // Since we're using a computed key, we have to do it this way
    errors['Controller module expected to export an object: ' + usersControllerPath] = {
      controllers: controllersPath
    };

    _.each(errors, function (args, message) {
      try {
        middleware.apply(middleware, [args]);
        assert.fail(null, null, 'Should had thrown an error');
      } catch (err) {
        assert.equal(message, err.message);
      }
    });
  });

  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware()));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should not do any routing when there are no operations', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer(testResourceList, testResources, [middleware(optionsWithControllersDir)]))
        .get(basePath + '/foo')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'OK');
        });
    });
  });

  it('should do routing when options.controllers is a valid directory path', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer(testResourceList, testResources, [middleware(optionsWithControllersDir)]))
        .get(basePath + '/users/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('./controllers/Users').response);
        });
    });
  });

  it('should do routing when options.controllers is a valid controller map', function () {
    var controller = require('./controllers/Users');

    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer(testResourceList, testResources, [middleware({
        controllers: {
          'Users_getById': controller.getById
        }
      })]))
        .get(basePath + '/users/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('./controllers/Users').response);
        });
    });
  });

  it('should not do any routing when there is no controller and use of stubs is off', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer(testResourceList, testResources, [middleware(optionsWithControllersDir)],
              function (req, res) {
                res.end('NOT OK');
              }))
        .get(basePath + '/pets/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'NOT OK');
        });
    });
  });

  it('should do routing when there is no controller and use of stubs is on', function () {
    var options = _.cloneDeep(optionsWithControllersDir);

    options.useStubs = true;

    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer(testResourceList, testResources, [middleware(options)], function (req, res) {
        res.end('NOT OK');
      }))
        .get(basePath + '/pets/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'Stubbed response for Pets_getById');
        });
    });
  });

  it('should do routing when controller method starts with an underscore', function () {
    request(createServer(testResourceList, [{
      apis: [
        {
          path: '/users/{id}',
          operations: [
            {
              method: 'GET',
              nickname: 'Users__getById',
              type: 'string'
            }
          ]
        }
      ]
    }], [middleware(optionsWithControllersDir)]))
      .get('/users/1')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), require('./controllers/Users').response);
      });
  });
});
