var sys = require('sys'),
    spawn = require('child_process').spawn,
    app = require('http').createServer(handler),
    url = require('url'),
    fs = require('fs'),
    all_disks = {},
    columns = new Array('rrqm_s', 'wrqm_s', 'r_s', 'w_s', 'rkb_s', 'wkb_s', 'avgrq_sz', 'avgqu_sz', 'await', 'r_await', 'w_await', 'svctm', 'util');

function handler(req, res) {
  var path = url.parse(req.url).pathname;
  switch (path) {
    case '/':
      console.log('Serving homepage');
      getFile('iostat.html', res);
      break;
    default:
      col = path.slice(1);
      if (columns.indexOf(col) != -1) {
        getDiskInfo(col, res);
      } else {
        console.log('Got a request for', path);
        getFile(path, res);
      }
  }
}

function getFile(filename, res) {
  fs.readFile(__dirname + '/' + filename, function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading ' + filename);
    }

    res.writeHead(200);
    res.end(data);
  });
}

function getDiskInfo(col, res) {
  results = new Array();
  for (name in all_disks) {
    disk = all_disks[name];
    points = new Array();
    size = disk.data[col].items.length;
    for (history = -1 * size; history < 0; history++) {
      points.push([history, disk.data[col].items[history + size]]);
    }

    results.push({
      label: name,
      data: points
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
    this.data[col] = new Queue(20);
  }
}
Disk.prototype.parse_data = function (data) {
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i];
    this.data[col].push(parseFloat(data[i]));
  }
}

function getIOStats() {
  iostat = spawn("iostat", ['-dx', '1'], {setsid: true, encoding: 'ascii'});
  iostat.stdout.on('data', function (data) {
    stdout = '' + data;
    disks = stdout.match(/^\w+(\s+\d+.\d+){13}/gm);
    if (!disks) {
      return;
    }

    disks.forEach(function (disk) {
      data = disk.replace(/\s+/g, ' ').split(' ');
      //console.log(data);
      name = data.shift();
      if (!(name in all_disks)) {
        all_disks[name] = new Disk(name);
      }
      all_disks[name].parse_data(data);
      //console.log(name + ' utilization:', all_disks[name].data.util.items);
    });
  });
}

app.listen(1337);
getIOStats();

