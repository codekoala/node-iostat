var sys = require('sys'),
    spawn = require('child_process').spawn,
    //app = require('http').createServer(handler),
    express = require('express'),
    url = require('url'),
    fs = require('fs'),
    all_disks = {},
    columns = [];

var app = express.createServer();
app.configure(function () {
  app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
});

app.get('/', function(req, res) {
  fs.readFile('./iostat.html', function (err, data){
    if (err) throw err;

    res.writeHead(200);
    res.end(data);
  });
});

app.use('/static', express.static(__dirname));

app.get('/data/:col', function(req, res) {
  if (req.params.col == 'column_names') {
    res.writeHead(200);
    res.end(JSON.stringify(columns));
  } else if (columns.indexOf(req.params.col) != -1) {
    since = parseInt(req.param('since', 0));
    getDiskInfo(req.params.col, since, res);
  }
});

function getDiskInfo(col, since, res) {
  results = new Array();
  for (name in all_disks) {
    disk = all_disks[name];
    data = disk.data[col].items.filter(function (value) { return value[0] >= since; });

    results.push({
      label: name,
      data: data
    });
  }
  res.writeHead(200);
  res.end(JSON.stringify(results));
}

function Queue(max_size) {
  this.items = new Array();
  this.max_size = max_size;
}
Queue.prototype.push = function (item) {
  if (this.items.length == this.max_size) {
    this.shift();
  }
  this.items.push(item);
}
Queue.prototype.shift = function () {
  return this.items.shift();
}

function Disk(name) {
  this.name = name;
  this.data = {}
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i];
    this.data[col] = new Queue(120);
  }
}
Disk.prototype.parse_data = function (data) {
  var now = Math.round(+new Date());
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i];
    this.data[col].push([now, parseFloat(data[i])]);
  }
}

function splitColumns(line) { return line.replace(/\s+/g, ' ').split(' '); }
function parseColumn(col) { return col.replace('/', '_').replace(/[^\w\-]/g, ''); }

function getIOStats() {
  /**
   * Executes the iostat command and regularly parses the output.  Data are
   * queued up for later use.
   **/

  iostat = spawn("iostat", ['-dx', '-p', '1'], {setsid: true, encoding: 'ascii'});
  iostat.stdout.on('data', function (data) {
    // coerce the buffer to a string
    stdout = '' + data;

    // make sure we have column names on the first run
    if (columns.length == 0) {
      raw_columns = stdout.match(/^Device:(\s+[\w\/%\-]+)+$/gm);
      if (!raw_columns) return;

      raw_columns = raw_columns.map(splitColumns)[0];
      raw_columns.shift();
      columns = raw_columns.map(parseColumn);
    }

    // now try to parse disk information
    disks = stdout.match(/^\w+(\s+\d+.\d+)+$/gm);
    if (!disks) return;

    disks.forEach(function (disk) {
      data = splitColumns(disk);
      name = data.shift();
      if (!(name in all_disks)) {
        all_disks[name] = new Disk(name);
      }
      all_disks[name].parse_data(data);
    });
  });
}

app.listen(8000);
getIOStats();

