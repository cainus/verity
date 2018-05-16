/*jshint multistr:true */
var verity = require('../index');
var expect = require('expect.js');
var deepEqual = require('deep-equal');
var difflet = require('difflet');
var assert = require('assert');
var util = require('../util');
var request = require('request');
var jsondiffpatch = require('jsondiffpatch');
var diff = difflet({indent:2, comment: true}).compare;

function flatten(obj) {
  return JSON.parse(JSON.stringify(obj));
}

var failOnError = function(err){
  if (err){
    console.error("");
    console.error("unexpected error: ", (err.message || err));
    console.error(err);
    console.error(new Error().stack);
    console.error("");
    throw "unexpected error: " + JSON.stringify((err.message || err));
  }
};


describe('verity', function(){
  var server;
  before(function(done){
    var express = require('express');
    var app = express();
    app.use(express.cookieParser('SECRET'));
    app.use(express.urlencoded());

    app.get('/simpleGET', function(req, res){
      res.send('hello world');
    });
    app.get('/headers', function(req, res){
      res.send(req.headers);
    });
    app.get('/query', function (req, res) {
      res.send(req.query);
    });
    app.post('/login', function(req, res){
      expect(req.body.username).to.equal("gregg");
      expect(req.body.password).to.equal("password");
      res.cookie('loggedIn', true);
      res.send("you're logged in");
    });

    app.get('/redirect', function(req, res) {
      res.redirect("/simpleGET");
    });

    app.get('/someJson', function(req, res){
      res.send({"test":"test"});
    });

    app.get('/moreJson', function(req, res){
      res.send({"test":"test", "foo": "bar"});
    });

    app.get('/echoCookies', function(req, res){
      res.send({gotCookies:req.cookies});
    });

    app.get('/cookies', function(req, res){
      res.cookie('name', 'tobi', { path: '/echoCookies', secure: true });
      res.cookie('rememberme', '1', { expires: new Date(Date.now() + 900000), httpOnly: true });
      res.send({gotCookies : req.cookies});
    });

    app.get('/errorWithStack', function(req, res) {
      var err = new Error("Kaboom!");
      res.status(500);
      res.header("X-Verity-Stack-Trace", new Buffer(err.stack).toString('base64'));
      res.send({ error: err.message });
    });

    app.get('/nested/path', function(req, res){
      res.send('nested path');
    });

    server = app.listen(3000, function(err){
      if (err) {
        throw err;
      }
      done();
    });
  });
  after(function(done){
    server.close(done);
  });

  it("can log a user in, if there's an authstrategy", function(done){
    var v = verity('http://localhost:3000/cookies');
    v.
      setAuthStrategy(function(creds, cb){
        v.request({  url : 'http://localhost:3000/login/',
                    body : 'username=' +
                              creds.login +
                              '&password=' +
                              creds.password,
                    method : 'POST',
                    headers : {
                      'content-type' : 'application/x-www-form-urlencoded'
                    }
                      }, function(err, response, body){
                          failOnError(err);
                          expect(body).to.equal("you're logged in");
                          expect(response.headers['set-cookie'][0]).
                            to.equal('loggedIn=true; Path=/');
                          cb(err);
                   });
      }).
      login({login:'gregg', password:'password'}).
      expectStatus(200).
      jsonMode().
      expectBody({gotCookies:{loggedIn:"true"}}).
      test(function(err, result){
        failOnError(err);
        done();
      });
  });
  it("can do a simple GET with 200", function(done){
    verity('http://localhost:3000/simpleGET').
      expectStatus(200).
      expectBody('hello world').
      log(false).
      test(done);
  });

  it("works with promises", function() {
    return verity('http://localhost:3000/simpleGET').
      expectStatus(200).
      expectBody('hello world').
      log(false).
      test();
  });

  it("can get cookies and verify them", function(done){
    verity('http://localhost:3000/cookies').
      expectStatus(200).
      jsonMode().
      log(false).
      expectCookies({"name": "todu"}).
      expectBody({gotCookies:{}}).
      test(function(err, result){
        expect(result.errors).to.have.property("Cookies");
        done();
      });
  });
  it("can get cookies and return them", function(done){
    var v = verity('http://localhost:3000/cookies');
    v.expectStatus(200).
      jsonMode().
      log(true).
      expectCookies({"name": "tobi"}).
      expectBody({gotCookies:{}}).
      test(function(err, result){
        expect(err).
          to.be(null);
        v.uri = v.uri.path('echoCookies');
        v.
         expectBody({gotCookies:{rememberme:1}}).
         log(true).
         test(function(err, result){
           done(err);
         });
      });
  });
  it("can do a simple GET with 404", function(done){
    verity('http://localhost:3000/doesNotExist').
      expectStatus(200).
      expectBody('hello world').
      log(false).
      test(function(err, result){
        // NOTE: commented out following assertion as it is no longer correct
        // expect(err.message).to.be('Expectations failed: Status, Body');

        //date header changes too much to test easily
        delete result.headers.date;
        var expected = {
          "errors": {
            "Status": {
              "actual": 404,
              "expected": 200,
              "error": "Expected status 200 but got 404"
            },
            "Body": {
              "actual": "Cannot GET /doesNotExist\n",
              "expected": "hello world",
              "error": 'ObjectEqualityAssertionError:\n\u001b[0m\u001b[34m\u001b[1m"Cannot GET /doesNotExist\n"\u001b[0m',
            }
          },
          "status": 404,
          "headers": {
            "x-powered-by": "Express",
            "content-type": "text/html",
            "connection": "close",
            "content-length": "25"
          },
          "cookies": {},
          "body": "Cannot GET /doesNotExist\n"
        };
        util.assertObjectEquals(flatten(result), flatten(expected));
        done();
      });
  });
  it("can do a json GET with correct json", function(done){
    verity('http://localhost:3000/someJson').
      jsonMode().
      expectStatus(200).
      expectBody({"test":"test"}).
      test(function(err){
        expect(err).to.be(null);
        done();
      });
  });
  it("can send headers", function(done){
    verity('http://localhost:3000/headers').
      jsonMode().
      header("X-Forwarded-Proto", 'https').
      expectBody({
        "x-forwarded-proto":"https",
        "host":"localhost:3000",
        "content-length":"0",
        "connection":"close"
      }).
      expectStatus(200).
      //log(false).
      test(done);
  });
  it("can set query string", function(done) {
    verity('http://localhost:3000/query').
      jsonMode().
      query({key: "value"}).
      expectBody({key: "value"}).
      expectStatus(200).
      test(done);
  });
  it("can set path", function(done) {
    verity('http://localhost:3000/no-such-path').
      path('simpleGET').
      expectBody("hello world").
      expectStatus(200).
      test(done);
  });
  it("passes path arguments correctly", function(done) {
    verity('http://localhost:3000/no-such-path').
      path(['nested'], 'path').
      expectBody("nested path").
      expectStatus(200).
      test(done);
  });
  it("can follow redirects", function(done) {
    verity("http://localhost:3000/redirect").
      followRedirect().
      expectStatus(200).
      expectBody("hello world").
      test(done);
  });
  it("can not follow redirects", function(done) {
    verity("http://localhost:3000/redirect").
      expectStatus(302).
      expectHeaders({"location": "/simpleGET"}).
      test(done);
  });
  it("can do a json GET with incorrect json", function(done){
    verity('http://localhost:3000/someJson').
      jsonMode().
      expectStatus(200).
      expectBody({"asdf":"asdf"}).
      log(false).
      test(function(err, result){
        //date header changes too much to test easily
        delete result.headers.date;

        // NOTE: commented out following assertion as it is no longer correct
        // expect(err.message).to.be("Expectations failed: Body");
        var expected = {
          "errors": {
            "Body": {
              "actual": {
                "test": "test"
              },
              "expected": {
                "asdf": "asdf"
              },
              "error": 'ObjectEqualityAssertionError:\n\u001b[0m{\u001b[32m\u001b[1m\n  "test" : "test"\u001b[0m\u001b[36m\u001b[1m // != undefined\u001b[0m\n  \u001b[31m\u001b[1m\u001b[0m\u001b[36m\u001b[1m// \u001b[0m\u001b[31m\u001b[1m"asdf" : "asdf"\u001b[0m\n}'
            }
          },
          "status": 200,
          "headers": {
            "x-powered-by": "Express",
            "content-type": "application/json; charset=utf-8",
            "content-length": "20",
            "etag": "\"-1526328376\"",
            "connection": "close"
          },
          "cookies": {},
          "body": {
            "test": "test"
          }
        };
        util.assertObjectEquals(flatten(result), flatten(expected));
        done();
      });
  });
  it("catches mismatches in expectPartialBody", function(done){
    verity('http://localhost:3000/moreJson').
      jsonMode().
      expectStatus(200).
      expectPartialBody({"test": 1}).
      log(false).
      test(function(err, result){
        //date header changes too much to test easily
        delete result.headers.date;

        // NOTE: commented out following assertion as it is no longer correct
        // expect(err.message).to.be("Expectations failed: Body");
        var expected = {
          "errors": {
            "Body": {
              "actual": {
                "test": "test",
                "foo": "bar"
              },
              "expected": {
                "test": 1
              },
              "error": 'ObjectPartialAssertionError\n\u001b[0m{\n  "test" : \u001b[34m\u001b[1m"test"\u001b[0m,\u001b[36m\u001b[1m // != 1\u001b[0m\n  "foo" : "bar"\n}'
            }
          },
          "status": 200,
          "headers": {
            "x-powered-by": "Express",
            "content-type": "application/json; charset=utf-8",
            "content-length": "36",
            "etag": "\"1140083462\"",
            "connection": "close"
          },
          "cookies": {},
          "body": {
            "test": "test",
            "foo": "bar"
          }
        };
        util.assertObjectEquals(flatten(result), flatten(expected));
        done();
      });
  });
  it("can accept stack traces from the backend", function (done) {
    verity('http://localhost:3000/errorWithStack')
      .jsonMode()
      .expectStatus(200)
      .test(function(err) {
        expect(err.message).to.contain("Error: Kaboom!"); // backend error
        expect(err.message).to.contain("Expected status 200 but got 500");
        done();
      });
  });
});
