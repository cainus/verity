/*jshint multistr:true */
var verity = require('../index');
var expect = require('expect.js');
var deepEqual = require('deep-equal');
var difflet = require('difflet');
var assert = require('assert');
var util = require('util');
var request = require('request');
var jsondiffpatch = require('jsondiffpatch');


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


var assertObjectEquals = function assertObjectEquals(actual, expected){
  if (!deepEqual(actual, expected)){
    var prettyJson = function(obj){
      return JSON.stringify(obj, null, "  ");
    };
    process.stdout.write(difflet.compare(actual, expected));
    console.log("\n\nactual");
    console.log(prettyJson(actual));
    console.log("\n\nexpected");
    console.log(prettyJson(expected));
    console.log("\n\n");
    console.log('jsonDiff');
    console.log(JSON.stringify(jsondiffpatch.diff(actual, expected), null, 2));
    console.log("\n\n");
    assert.fail(actual, expected);
    return false;
  }
  return true;
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

    app.get('/echoCookies', function(req, res){
      res.send({gotCookies:req.cookies});
    });

    app.get('/cookies', function(req, res){
      res.cookie('name', 'tobi', { path: '/echoCookies', secure: true });
      res.cookie('rememberme', '1', { expires: new Date(Date.now() + 900000), httpOnly: true });
      res.send({gotCookies : req.cookies});
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
      test(done);
  });
  it("can get cookies and verify them", function(done){
    verity('http://localhost:3000/cookies').
      expectStatus(200).
      jsonMode().
      log(false).
      expectCookie("name", "todu").
      expectBody({gotCookies:{}}).
      test(function(err, result){
        expect(result.cookies.errors[0].message).
          to.eql("expected 'tobi' to equal 'todu'");
        done();
      });
  });
  it("can get cookies and return them", function(done){
    var v = verity('http://localhost:3000/cookies');
    v.expectStatus(200).
      jsonMode().
      log(true).
      expectCookie("name", "tobi").
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
        expect(err.message).to.be('Expectations failed: status: (actual) 404 != (expected) 200');
        delete result.headers.actual.date;
          //date header changes too much to test easily
        var expected = {
            status : {
              actual : 404,
              expected : 200
            },
            headers : {
              actual: { 
                'x-powered-by': 'Express',
                'content-type': 'text/html',
                connection: 'keep-alive',
                'transfer-encoding': 'chunked'
              },
              expected : {}
            },
            body : {
              actual : 'Cannot GET /doesNotExist\n',
              errors: [
                  {
                    "actual": "Cannot GET /doesNotExist\n",
                    "expected": "hello world",
                    "colorDiff": "\u001b[34m\u001b[1m\"hello world\"\u001b[0m"
                  }
                ]
            }
        };
        expect(JSON.stringify(result)).to.eql(JSON.stringify(expected));
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
        "connection":"keep-alive"
      }).
      expectStatus(200).
      //log(false).
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
      expectHeader("location", "/simpleGET").
      test(done);
  });
  it("can do a json GET with incorrect json", function(done){
    verity('http://localhost:3000/someJson').
      jsonMode().
      expectStatus(200).
      expectBody({"asdf":"asdf"}).
      log(false).
      test(function(err, result){
        delete result.headers.actual.date;
          //date header changes too much to test easily
        expect(err.message).to.be("Expectations failed: body didn't match expectations.");
        var expected = {
            status : {
              actual : 200,
              expected : 200
            },
            headers : {
              actual: { 
                'x-powered-by': 'Express',
                'content-type': 'application/json; charset=utf-8',
                'content-length': '20',
                etag: '"-1526328376"',
                connection: 'keep-alive',
              },
              expected :  { 
                'content-type': 'application/json' 
              }
            },
            body: {
                actual: {
                  test: "test"
                },
                errors: [
                  {
                    actual: {
                      "test": "test"
                    },
                    expected: {
                      "asdf": "asdf"
                    },
                    colorDiff: "{\u001b[32m\u001b[1m\"asdf\":\"asdf\"\u001b[0m,\u001b[31m\u001b[1m\"test\":\"test\"\u001b[0m}"
                  }
                ]
              }

        };
        expect(JSON.stringify(result)).to.eql(JSON.stringify(expected));
        done();
      });
  });
  describe("checkBody", function(){
    describe("with a non-function", function(){
      it("can find errors", function(done){
        verity('http://localhost:3000/someJson').
          jsonMode().
          log(false).
          expectStatus(200).
          checkBody({asdf:'asdf'}).
          test(function(err, result){
            expect(err.message).to.be("Expectations failed: body didn't match expectations.");
            expect(result.body.errors.length).to.equal(1);
            var error = result.body.errors[0];
            expect(error.message).
              to.equal("ObjectEqualityAssertionError");
            expect(error.actual).
              to.eql({test:'test'});
            expect(error.expected).
              to.eql({asdf:'asdf'});
            expect(error.colorDiff).
              to.eql('{\u001b[32m\u001b[1m"asdf":"asdf"\u001b[0m,\u001b[31m\u001b[1m"test":"test"\u001b[0m}');
            done();
          });
      });
    });
    describe("with a function", function(){
      it("can find errors", function(done){
        verity('http://localhost:3000/someJson').
          jsonMode().
          log(false).
          expectStatus(200).
          checkBody(function(body){
            expect(body.asdf).to.equal("asdf");
          }).
          test(function(err, result){
            expect(err.message).to.be("Expectations failed: body didn't match expectations.");
            expect(result.body.errors.length).to.equal(1);
            expect(result.body.errors[0].message).
              to.equal("expected undefined to equal \'asdf\'");
            done();
          });
      });
    });
  });
});


