REPORTER = spec

lint:
	./node_modules/.bin/jshint ./test ./index.js

test:
	$(MAKE) lint
	./node_modules/.bin/mocha -b --reporter $(REPORTER) --check-leaks

test-cov:
	$(MAKE) lint
	./node_modules/.bin/istanbul cover \
	./node_modules/mocha/bin/_mocha -- -b --reporter $(REPORTER) --check-leaks
	echo "See reports at ./coverage/lcov-report/index.html"

test-coveralls:
	echo TRAVIS_JOB_ID $(TRAVIS_JOB_ID)
	./node_modules/.bin/istanbul cover \
	./node_modules/mocha/bin/_mocha --report lcovonly \
 	-- -b --reporter $(REPORTER) --check-leaks && \
		cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js

.PHONY: test
