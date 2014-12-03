/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
'use strict';

var _ = require('lodash');
var assert = require('assert');
var helpers = require('../helpers');
var createServer = helpers.createServer;
var path = require('path');
var request = require('supertest');
var middleware = require('../../').middleware.v2_0.swaggerSecurity;

var localSecurity = require('./swagger-security.json');
var globalSecurity = require('./swagger-global-security.json');

var SecurityDef = function(allow) {
  if (allow === undefined) { allow = true; }
  this.called = false;
  var self = this;
  this.func = function(request, securityDefinition, scopes, cb) {
    assert(Array.isArray(scopes));
    self.called = true;
    cb(allow);
  }
};

describe('Swagger Security Middleware v2.0', function() {

  describe('with global requirements', function() {

    it('should call global middleware when unsecured locally', function(done) {
      var global = new SecurityDef();
      var local = new SecurityDef();
      request(createServer([globalSecurity], [middleware({ global: global.func, local: local.func })]))
        .get('/api/unsecured')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 200);
          assert(global.called);
          assert(!local.called);
          done();
        });
    });

    it('should call local middleware when secured locally', function(done) {
      var global = new SecurityDef();
      var local = new SecurityDef();
      request(createServer([globalSecurity], [middleware({ global: global.func, local: local.func })]))
        .get('/api/secured')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 200);
          assert(local.called);
          assert(!global.called);
          done();
        });
    });

    it('should not authorize if missing security definition', function(done) {
      request(createServer([globalSecurity], [middleware()]))
        .get('/api/unsecured')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });

    it('should not authorize if handler denies', function(done) {
      var global = new SecurityDef(false);
      var local = new SecurityDef(true);
      request(createServer([globalSecurity], [middleware({ global: global.func, local: local.func })]))
        .get('/api/unsecured')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });

  });

  it('should call middleware when secured', function(done) {
    var sec = new SecurityDef();
    request(createServer([localSecurity], [middleware({ local: sec.func })]))
      .get('/api/secured')
      .end(function(err, res) {
        helpers.expectContent('OK')(err, res);
        assert(res.statusCode === 200);
        assert(sec.called);
        done();
      });
  });

  it('should not call middleware when unsecured', function(done) {
    var sec = new SecurityDef();
    request(createServer([localSecurity], [middleware({ local: sec.func })]))
      .get('/api/unsecured')
      .end(function(err, res) {
        helpers.expectContent('OK')(err, res);
        assert(res.statusCode === 200);
        assert(!sec.called);
        done();
      });
  });

  it('should err if missing security definition', function(done) {
    request(createServer([localSecurity], [middleware()]))
      .get('/api/secured')
      .end(function(err, res) {
        if (err) { return done(err); }
        assert(res.statusCode === 403);
        done();
      });
  });

  it('should not authorize if handler denies', function(done) {
    var sec = new SecurityDef(false);
    request(createServer([localSecurity], [middleware({ local: sec.func })]))
      .get('/api/secured')
      .end(function(err, res) {
        if (err) { return done(err); }
        assert(res.statusCode === 403);
        done();
      });
  });

  describe('AND requirements', function() {

    it('should authorize if both are true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(true);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedAnd')
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);
          assert(res.statusCode === 200);
          done();
        });
    });

    it('should not authorize if first is false', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(true);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedAnd')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });

    it('should not authorize if second is false', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(false);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedAnd')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });

    it('should not authorize if both are false', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(false);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedAnd')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });

  });

  describe('OR requirements', function() {

    it('should authorize if both are true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(true);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedOr')
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);
          assert(res.statusCode === 200);
          done();
        });
    });

    it('should authorize if first is true', function(done) {
      var local = new SecurityDef(true);
      var local2 = new SecurityDef(false);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedOr')
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);
          assert(res.statusCode === 200);
          done();
        });
    });

    it('should authorize if second is true', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(true);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedOr')
        .end(function(err, res) {
          helpers.expectContent('OK')(err, res);
          assert(res.statusCode === 200);
          done();
        });
    });

    it('should not authorize if both are false', function(done) {
      var local = new SecurityDef(false);
      var local2 = new SecurityDef(false);
      request(createServer([localSecurity], [middleware({ local: local.func, local2: local2.func })]))
        .get('/api/securedAnd')
        .end(function(err, res) {
          if (err) { return done(err); }
          assert(res.statusCode === 403);
          done();
        });
    });
  });

});
