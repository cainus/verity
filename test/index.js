/*jshint multistr:true */
var verity = require('../index');
var expect = require('expect.js');

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
      shouldThrow(false).
      expectStatus(200).
      expectBody('hello world').
      test(done);
  });
  it("can do a simple GET with 404", function(done){
    verity('http://localhost:3000/doesNotExist').
      shouldThrow(false).
      expectStatus(200).
      expectBody('hello world').
      test(function(err, result){
        expect(err.message).to.be('Expectations failed');
        delete result.headers.actual.date;
          //date header changes too much to test easily
        expect(result).to.eql(
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
              expected : 'hello world',
              diff : '\u001b[34m\u001b[1m"hello world"\u001b[0m'
            }
        });
        done();
      });
  });
  it("can do a json GET with correct json", function(done){
    verity('http://localhost:3000/someJson').
      jsonMode().
      shouldThrow(false).
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
      shouldThrow(false).
      expectStatus(200).
      expectBody({"asdf":"asdf"}).
      test(function(err, result){
        delete result.headers.actual.date;
          //date header changes too much to test easily
        expect(err.message).to.be('Expectations failed');
        expect(result).to.eql(
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
            body : {
              actual : {test : 'test'},
              expected : {asdf : 'asdf'},
              diff : '{\u001b[32m\u001b[1m\n  "asdf" : "asdf"\u001b[0m,\n  \u001b[31m\u001b[1m"test" : "test"\u001b[0m\n}'
            }
        });
        done();
      });
  });
});
