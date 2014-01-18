#verity

###integration testing for http requests

###features:
* content-type matching
* json response testing
* responses are verified atomically, for better reporting
* supports cookies
* supports login strategies
* easy url manipulation

###usage:

```javascript
  var v = verity("http://localhost:8080/path/");
  v.jsonMode();
  v.method = "POST";
  v.body = {"some" : "json"};
  v.expectedStatus = 200;
  v.expectedBody = {"success" : true};
  v.test();
```



