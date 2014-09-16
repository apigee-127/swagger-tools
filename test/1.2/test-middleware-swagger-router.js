/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = require('lodash');
var assert = require('assert');
var middleware = require('../../').middleware.v1_2.swaggerRouter; // jshint ignore:line
var path = require('path');
var request = require('supertest');
var helpers = require('../helpers');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

var rlJson = require('../../samples/1.2/resource-listing.json');
var petJson = require('../../samples/1.2/pet.json');
var userJson = require('../../samples/1.2/user.json');
var optionsWithControllersDir = {
  controllers: path.join(__dirname, '..', 'controllers')
};
var samplePet = {
  category: {
    id: 1,
    name: 'Sample text'
  },
  id: 1,
  name: 'Sample text',
  photoUrls: [
    'Sample text'
  ],
  status: 'available',
  tags: [
    {
      id: 1,
      name: 'Sample text'
    }
  ]
};

var testScenarios = {};

_.each(['', '/api/v1'], function (basePath) {
  var clonedRL = _.cloneDeep(rlJson);
  var clonedP = _.cloneDeep(petJson);
  var clonedU = _.cloneDeep(userJson);

  // Add nicknames the router understands for the operations we're testing
  clonedP.apis[0].operations[0].nickname = 'Pets_getById';
  clonedU.apis[0].operations[2].nickname = 'Users_getById';

  // Setup the proper basePath
  switch (basePath) {
  case '':
    delete clonedP.basePath;
    delete clonedU.basePath;

    break;

  case '/api/v1':
    clonedP.basePath = 'http://localhost/api/v1';
    clonedU.basePath = 'http://localhost/api/v1';

    break;
  }

  testScenarios[basePath] = {
    resourceListing: clonedRL,
    apiDeclarations: [
      clonedP,
      clonedU
    ]
  };
});

describe('Swagger Router Middleware v1.2', function () {
  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware(optionsWithControllersDir)));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should do no routing when there is no route match', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
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

  it('should return a 405 when thre is a route match but there are no operations', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .put(basePath + '/pet/1')
        .expect(405)
        .expect('Allow', 'DELETE, GET, PATCH, POST')
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text),
                       'Route defined in Swagger specification but there is no defined PUT operation.');
        });
    });
  });

  it('should do routing when options.controllers is a valid directory path', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Users').response);
        });
    });
  });

  it('should do routing when options.controllers is a valid array of directory paths', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = _.cloneDeep(testScenarios[basePath].apiDeclarations);

      testResources[0].apis[2].operations[0].nickname = 'Pets_createPet';

      request(createServer([testResourceList, testResources], [middleware({
        controllers: [
          path.join(__dirname, '..', 'controllers'),
          path.join(__dirname, '..', 'controllers2')
        ]
      })]))
        .post(basePath + '/pet')
        .send({})
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers2/Pets').response);
        });
    });
  });

  it('should do routing when options.controllers is a valid controller map', function () {
    var controller = require('../controllers/Users');

    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware({
        controllers: {
          'Users_getById': controller.getById
        }
      })]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), controller.response);
        });
    });
  });

  it('should not do any routing when there is no controller and use of stubs is off', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)],
              function (req, res) {
                res.end('NOT OK');
              }))
        .get(basePath + '/pet/1')
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
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(options)], function (req, res) {
        res.end('NOT OK');
      }))
      .get(basePath + '/pet/1')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.deepEqual(JSON.parse(prepareText(res.text)), samplePet);
      });
    });
  });

  it('should do routing when controller method starts with an underscore', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = _.cloneDeep(testScenarios[basePath].apiDeclarations);

      testResources[1].apis[0].operations[2].nickname = 'Users__getById';

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Users').response);
        });
    });
  });

  it('should indicate whether or not useStubs is on or not', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = _.cloneDeep(testScenarios[basePath].apiDeclarations);

      _.times(2, function (n) {
        var useStubs = n === 1 ? true : false;
        var options = {
          controllers: {
            'Pets_getPetById': function (req, res) {
              if (useStubs === req.swagger.useStubs) {
                res.end('OK');
              } else {
                res.end('NOT OK');
              }
            }
          },
          useStubs: useStubs
        };

        request(createServer([testResourceList, testResources], [middleware(options)]))
          .get(basePath + '/pet/1')
          .expect(200)
          .end(function(err, res) { // jshint ignore:line
            if (err) {
              throw err;
            }
            if (useStubs) {
              assert.deepEqual(JSON.parse(prepareText(res.text)), samplePet);
            } else {
              assert.equal(prepareText(res.text), 'OK');
            }
          });
      });
    });
  });
});
