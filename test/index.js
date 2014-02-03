/*jshint multistr:true */
var verity = require('../index');
var expect = require('expect.js');
var deepEqual = require('deep-equal');
var difflet = require('difflet');
var assert = require('assert');
var util = require('util');

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

    app.get('/simpleGET', function(req, res){
      res.send('hello world');
    });
    app.get('/someJson', function(req, res){
      res.send({"test":"test"});
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

  it("can do a simple GET with 200", function(done){
    verity('http://localhost:3000/simpleGET').
      expectStatus(200).
      expectBody('hello world').
      test(done);
  });
  it("can do a simple GET with 404", function(done){
    verity('http://localhost:3000/doesNotExist').
      expectStatus(200).
      expectBody('hello world').
      test(function(err, result){
        expect(err.message).to.be('Expectations failed');
        delete result.headers.actual.date;
          //date header changes too much to test easily
        assertObjectEquals(result,
          {
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
        });
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
  it("can do a json GET with incorrect json", function(done){
    verity('http://localhost:3000/someJson').
      jsonMode().
      expectStatus(200).
      expectBody({"asdf":"asdf"}).
      test(function(err, result){
        delete result.headers.actual.date;
          //date header changes too much to test easily
        expect(err.message).to.be('Expectations failed');
        assertObjectEquals(result,
          {
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

        });
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
            expect(err.message).to.equal('Expectations failed');
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
          expectStatus(200).
          checkBody(function(body){
            expect(body.asdf).to.equal("asdf");
          }).
          test(function(err, result){
            expect(err.message).to.equal('Expectations failed');
            expect(result.body.errors.length).to.equal(1);
            expect(result.body.errors[0].message).
              to.equal("expected undefined to equal \'asdf\'");
            done();
          });
      });
    });
  });
});
