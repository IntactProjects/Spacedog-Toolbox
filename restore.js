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
  .option('-m, --newpassword <newpassword>', 'Credentials password. If not set, `%Azerty12345` will be used')
  .parse(process.argv)

console.log('Restore script starting.')

var defaultPassword = '%Azerty12345'
if (program.newpassword) {
  defaultPassword = program.newpassword
}

console.log('Backendurl\t%s \nUsername\t%s \nPassword\t***** \nNewPassword\t%s', program.backendurl, program.username, defaultPassword)

function restore () {

  var auth = `${program.username}:${program.password}`
  var headers = {
    'Authorization': `Basic ${new Buffer(auth).toString('base64')}`,
    'Content-Type': 'application/json; charset=utf-8'
  }

  var credentials = [], schemas, data;


  console.log('Fetching remote schemas for deletion')    
  request({
    method: 'GET',
    url:`${program.backendurl}/1/schema`,
    json: true,
    headers,
  }).then(function(ret){

    var deleteSchemaReqs = []

    console.log('Emptying schema.')

    Object.keys(ret).forEach(function(schema) {
      deleteSchemaReqs.push(request({
        method: 'DELETE',
        url:`${program.backendurl}/1/schema/${schema}`,
        json: true,
        headers,
      }))
    })

    return Promise.all(deleteSchemaReqs)

  }, rejectLog('Could not fetch remote schemas for deletion'))

  .then(function(){
    console.log('Schemas emptyed.')
    return Promise.resolve()
  }, rejectLog('Could not empty schemas'))

  .then(function(){
    console.log('Emptying credentials.')
    return request({
      method: 'DELETE',
      url:`${program.backendurl}/1/credentials`,
      json: true,
      headers,
    })
  })

  .then(function(){
    console.log('Reading credentials file.')
    return fs.readJson('dump/data.credentials.json')
  }, rejectLog('Could not empty credentials'))

  .then(
    function(_credentials) {
      console.log('Credentials file read.')
      console.log(`Restoring credentials(${_credentials.length}) with password for every user : ${defaultPassword} `)
      var credentialsRequests = []
      
      credentials = _credentials

      credentials.forEach(function (c) {
        c.password = defaultPassword
        credentialsRequests.push({
          method: 'POST',
          url: `${program.backendurl}/1/credentials`,
          json: true,
          headers,
          body: c
        })
      })

      var i = 1
      return credentialsRequests.reduce(function (previous, item) {
        return previous.then(function () {

          return new Promise(function (resolve, reject) {

            process.stdout.write(`${i}...`)
            i++
            request(item).then(function (createdCredentials) {

              credentials.find(function(c) { return c.id === item.body.id }).newId = createdCredentials.id
              resolve()

            }, function(e){
              console.log('----')
              console.log(`Could not create credential ${item} : ${e}`)
              console.log('Continuing....')
              console.log('----')
              resolve()
            })
          })

        })
      }, Promise.resolve())

    },
    rejectLog('Error reading credentials file.')
  )


  .then(
    function() {
      console.log('Credentials populated (' + credentials.length + ').')

      console.log('Reading dump/schema.json')
      return fs.readJson('dump/schema.json')
    },
    rejectLog('Error populating credentials.')
  )


  .then(
    function (_schemas) {
      console.log('Schema.json read')

      console.log('Sending POST /schemas/<schema> for each schema of schema.json')
      schemas = _schemas
      var schemasRequests = []
      Object.keys(schemas).forEach(function (schema) {
        var body = {}
        body[schema] = schemas[schema]
        schemasRequests.push({
          url: `${program.backendurl}/1/schema/${schema}`,
          json: true,
          method: 'POST',
          headers,
          body
        })
      })

      return schemasRequests.reduce(function (previous, item) {
        return previous.then(function () {
          return request(item)
        })
      }, Promise.resolve())

    }, 
    rejectLog('Error reading dump/schema')
  )


  .then(
    function () {
      console.log('Schemas created')

      console.log('Reading json data files and replacing found credentials id')
      var dataReads = []
      Object.keys(schemas).forEach(function (schema) {
        dataReads.push(new Promise (function (resolve, reject) {
          var currentSchema = schema
          fs.readJson(`dump/data.${schema}.json`, {encoding:'utf8'}).then(function (data) {

            // Uniquement pour va bene du coup
            if (currentSchema === 'admin' || currentSchema === 'appuser') {
              data.forEach(function(d){
                if (d.credential_id) {
                  d.credential_id = credentials.find(function(c){ return d.credential_id === c.id }).newId
                }
              })
            }

            resolve({
              schema: currentSchema,
              data: data
            })
          })
        }))
      })
      return Promise.all(dataReads)
    }, 
    rejectLog('Error creating schema.')
  )


  .then(
    function(_data) {
      data = _data
      console.log('Json data files read and prepared (credentials id-wise)')

      console.log('Preparing batch requests to populate backend')
      var allRequests = []
      data.forEach(function (d) {
        var schema = d.schema
        d.data.forEach(function (o) {
          var objectId = o.meta.id
          delete o.meta
          allRequests.push({
            method: 'POST',
            path: `/1/data/${schema}/?id=${objectId}`,
            content: o
          })
        })
      })
      var batch = []
      var currentTen = []
      for (var i = 0 ; i <= allRequests.length ; i++) {
        if (allRequests[i] !== null) {
          currentTen.push(allRequests[i])
        }
        if (i % 10 == 0) {
          batch.push(currentTen)
          currentTen = []
        }
      }
      console.log(`Batch requests prepared (${allRequests.length} or ${batch.length} HTTP requests)`)
      return Promise.resolve(batch)
    }, 
    rejectLog('Error reading json data files.')
  )


  .then(
    function(_batch) {
      console.log('Chaining batch requests. Hold on to your butt.')
      var i = 1
      return _batch.reduce(function (previous, item) {
        return previous.then(function (previousValue) {
          process.stdout.write(`${i}...`)
          i++

          return request({
            method: 'POST',
            url: `${program.backendurl}/1/batch`,
            json: true,
            headers,
            body: item
          })

        })
      }, Promise.resolve())
    },
    rejectLog('Error preparing batch requests.')
  )


  .then(
    function() {
      console.log('Batch request executed.')
      
      // END
      console.log('Finished with success !')
    },
    rejectLog('Error executing batch requets.')
  )

}

new Confirm(`Confirm ? This will empty the selected backend and restore from what is in the dump/ folder`).ask(function (answer) {
  if (answer) {
    restore()    
  } else {
    console.log('Ending')
    process.exit(1)
  }
})

function rejectLog (message) {
  return function (err) {
    console.error(err)
    console.error(message)
    console.error('Stopping.')
    process.exit(0)
  }
}


