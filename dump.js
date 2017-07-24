#!/usr/bin/env node --harmony
var program = require('commander')
var fs = require('fs-extra')
var mkdirp = require('mkdirp')
var Confirm = require('prompt-confirm')
var request = require('request-promise')

program
  .version(require('./package.json').version)
  .option('-b, --backendurl <backendurl>', 'The backend url you want to dump')
  .option('-u, --username <username>', 'The user to authenticate as')
  .option('-p, --password <password>', 'The user\'s password')
  .parse(process.argv)

console.log('Dump script starting.')

console.log('Backendurl\t%s \nUsername\t%s \nPassword\t*****', program.backendurl, program.username)

function dump () {
  mkdirp('dump', function (err) {

    var auth = `${program.username}:${program.password}`
    var headers = {
      'Authorization': `Basic ${new Buffer(auth).toString('base64')}`
    }

    var schemas, data

    console.log('Fetching /schema')

    request({
      url: `${program.backendurl}/1/schema`,
      json: true,
      headers
    })

    .then(

      function (_schemas) {
        console.log('Got schemas from /schema')
        console.log('Writing dump/schema.json')
        schemas = _schemas
        return fs.writeJson('dump/schema.json', schemas)
      },
      rejectLog('Error fetching /schema')

    )

    .then(

      function () {
        console.log('Wrote dump/schema.json')
        console.log('Fetching data for every schema')
        var schemaDatasRequests = []
        Object.keys(schemas).forEach(function (schema) {
          schemaDatasRequests.push(getAllSchemaData(program.backendurl, headers, schema))
        })
        return Promise.all(schemaDatasRequests)
      },
      rejectLog('Error writing dump/schema.json')

    )

    .then(

      function (_data) {
        console.log('Got data for every schema')
        console.log('Writing data files')
        data = _data
        var schemaDatasWrite = []
        data.forEach(function (schemaAndResults) {
          console.log(`dump/data.${schemaAndResults.schema}.json (${schemaAndResults.results.length} objects)`)
          schemaDatasWrite.push(fs.writeJson(`dump/data.${schemaAndResults.schema}.json`, schemaAndResults.results))
        })
        return Promise.all(schemaDatasWrite)
      },
      rejectLog('Error fetching data')

    )

    .then(

      function () {
        console.log('Wrote data files')
        console.log('Fetching credentials')
        return getAllCredentials(program.backendurl, headers)
      },
      rejectLog('Error writing data files.')

    )

    .then(

      function (_credentials) {
        console.log('Got credentials')
        console.log('Writing credentials file')
        return fs.writeJson(`dump/data.credentials.json`, _credentials)
      },
      rejectLog('Error fetching credentials.')

    )

    .then(

      function (credentials) {
        console.log('Credentials written')
        // END
        console.log('Finished with success !')
      },
      rejectLog('Error writing credentials file.')

    )

  })
}

new Confirm(`Confirm ? This will create a folder dump/ where you are right now`).ask(function (answer) {
  if (answer) {
    dump()    
  } else {
    console.log('Ending')
  }
})

function getAllSchemaData (backendurl, headers, schema) {
  var get = function(backendurl, headers, schema, results, from, size, resolve, reject) {
    request({
      url: `${backendurl}/1/search/${schema}`,
      json: true,
      headers,
      method: 'POST',
      body: {
        from,
        size
      }
    }).then(function (res) {
      results = results.concat(res.results)
      if (results.length < res.total) {
        from = from + size
        get(backendurl, headers, schema, results, from, size, resolve, reject)
      } else {
        resolve({
          schema,
          results
        })
      }
    }, reject)
  }

  return new Promise((resolve, reject) => {
    get(backendurl, headers, schema, [], 0, 1000, resolve, reject)
  })
}


function getAllCredentials (backendurl, headers) {
  var get = function(backendurl, headers, results, from, size, resolve, reject) {
    request({
      url: `${backendurl}/1/credentials?from=${from}&size=${size}`,
      headers,
      method: 'GET',
      json: true
    }).then(function (res) {
      results = results.concat(res.results)
      if (results.length < res.total) {
        from = from + size
        if (from >= 1000) {
          resolve(results)  
        } else if (from + size > 1000) {
          size = 1000 - from
          get(backendurl, headers, results, from, size, resolve, reject)
        } else {
          get(backendurl, headers, results, from, size, resolve, reject)
        }
      } else {
        resolve(results)
      }
    }, reject)
  }

  return new Promise((resolve, reject) => {
    get(backendurl, headers, [], 0, 1000, resolve, reject)
  })
}

function rejectLog (message) {
  return function (err) {
    console.error(err)
    console.error(message)
    console.error('Stopping.')
  }
}

