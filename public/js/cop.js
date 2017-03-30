var canvas = new fabric.Canvas('canvas', {
    selection: false,
    preserveObjectStacking: true,
    renderOnAddRemove: false,
    enableRetinaScaling: false
});
var namespace = '/mcscop/';
var socketurl = 'https://www.ironrain.org/mcscop/';
canvas.setZoom(1.0);
var creatingLink = false;
var firstObject = null;
var startX = 0;
var startY = 0;
var scale = 1;
var originx = 0;
var originy = 0;
var zoomIntensity = 0.2;
var mission = null;
var objectSelect = [{id:0, name:'none/unknown'}];
var dateSlider = null;
var images = {};
var tableData = [];
var eventTimes = [];
var objectsLoaded = null;
var updatingObject = false;
var socket = io(socketurl, {path: namespace + '/socket.io'});
var fps = 10;
var now;
var then = Date.now();
var interval = 1000/fps;
var delta;
var firstNode = null;
var zoom = 1.0;
var panning = false;
var dirty = false;
var SVGCache = {};
var tempLink = null;
var objectCache = {};

var CustomDirectLoadStrategy = function(grid) {
    jsGrid.loadStrategies.DirectLoadingStrategy.call(this, grid);
};
 
CustomDirectLoadStrategy.prototype = new jsGrid.loadStrategies.DirectLoadingStrategy();
CustomDirectLoadStrategy.prototype.finishInsert = function(loadedData) {
    var grid = this._grid;
    if (loadedData.id != 0) {
        grid.option("data").push(loadedData);
        grid.refresh();
    }
    grid.inserting = false;
};

var DateField = function(config) {
    jsGrid.Field.call(this, config);
};
 
DateField.prototype = new jsGrid.Field({
    css: "date-field",
    align: "center",
    sorter: function(date1, date2) {
        return new Date(date1) - new Date(date2);
    },
    itemTemplate: function(value) {
        var date = new Date(value);
        return (date.getFullYear() + '-' + addZero(date.getMonth()+1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds()) + '.' + date.getMilliseconds());
    },
    insertTemplate: function(value) {
        return this._insertPicker = $("<input>").datetimepicker({
            timeFormat: "HH:mm:ss.l",
            controlType: 'select',
            showMillisec: true
        });
    },
    editTemplate: function(value) {
        this._editPicker = $("<input>").datetimepicker({
            setDate: new Date(value),
            timeFormat: "HH:mm:ss.l",
            controlType: 'select',
            showMillisec: true
        });
        this._editPicker.datetimepicker('setDate', new Date(value));
        return this._editPicker;
    },
    insertValue: function() {
        return this._insertPicker.datepicker("getDate").getTime();
    },
    editValue: function() {
        return this._editPicker.datepicker("getDate").getTime();
    }
});
jsGrid.fields.date = DateField;

socket.on('all_objects', function (msg) {
    canvas.clear();
    objectSelect = [{id:0, name:'none/unknown'}];
    objectsLoaded = [];
    for (var o in msg) {
        objectSelect.push({uuid:msg[o].uuid, name:msg[o].name});
        if (SVGCache[msg[o].image] === undefined) {
            var shape = msg[o].image;
            SVGCache[msg[o].image] = null;
            objectsLoaded.push(false);
            getShape(msg[o].image);
        }
    }
    checkIfShapesCached(msg);
});

function getShape(shape) {
    var path = 'images/icons/';
    $.get(path + shape, function(data) {
        SVGCache[shape] = data;
        objectsLoaded.pop();
    }, 'text');
}


function checkIfShapesCached(msg) {
//    canvas.renderOnAddRemove = false;
    if (objectsLoaded.length == 0) {
        console.log('cached');
        for (var o in msg) {
            objectsLoaded.push(false);
            addObjectToCanvas(msg[o]);
        }
        checkIfObjectsLoaded();
    } else {
        setTimeout(function() {
            checkIfShapesCached(msg);
        }, 50);
    }
}

function checkIfObjectsLoaded() {
    if (objectsLoaded.length == 0) {
//        canvas.renderOnAddRemove = true;
        console.log('objects loaded');
        console.log('get links');
        socket.emit('get_links', mission);
        canvas.renderOnAddRemove = true;
    } else {
        setTimeout(checkIfObjectsLoaded, 50);
    }
}

function editDetails(uuid) {
    if (canvas.getActiveObject()) {
        socket.emit('get_details', canvas.getActiveObject().uuid, function(data) {
            $('#modal-title').text('Edit Object');
            $('#modal-body').html('<input type="hidden" id="object_details_uuid" name="object_details_uuid" value="' + canvas.getActiveObject().uuid + '"><textarea id="object_details" class="object-details">' + data + '</textarea>');
            $('#modal-footer').html('<button type="button" class="button btn btn-primary" onclick="updateDetails()">Save</button><button type="button" class="button btn btn-default" data-dismiss="modal">Close</button>');
            $('#modal').modal('show');
        });
    }
}

function updateDetails() {
    socket.emit('update_details', JSON.stringify({'uuid': $('#object_details_uuid').val(), 'details': $('#object_details').val()}));
    $('#modal').modal('hide');
}

function updateLayers() {
    var objects = [];
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.getObjects()[i].uuid)
            objects.push({uuid: canvas.getObjects()[i].uuid, type: canvas.getObjects()[i].objType, z: i});
    }
    socket.emit('update_layers', JSON.stringify(objects));
} 

socket.on('connect', function() {
    $('#modal').modal('hide');
    $('#modal-title').text('Please wait...!');
    $('#modal-body').html('<p>Loading COP, please wait...</p><img src="images/loading.gif"/>');
    $('#modal-footer').html('');
    $('#modal').modal('show')
    console.log('connect');
    socket.emit('join', mission);
    console.log('get objects');
    socket.emit('get_objects', mission);
    console.log('get events');
    socket.emit('get_events', mission);
});

socket.on('disco', function (msg) {
    $('#modal-title').text('Attention!');
    $('#modal-body').html('<p>Connection lost!</p>');
    $('#modal-footer').html('<button type="button" class="button btn btn-default" data-dismiss="modal">Close</button>');
    $('#modal').modal('show');
});

socket.on('disconnect', function() {
    $('#modal-title').text('Attention!');
    $('#modal-body').html('<p>Connection lost!</p>');
    $('#modal-footer').html('<button type="button" class="button btn btn-default" data-dismiss="modal">Close</button>');
    $('#modal').modal('show')
});

socket.on('all_links', function (msg) {
    links = []
    for (var link in msg) {
        addLinkToCanvas(msg[link]);
    }
    $('#events').jsGrid("fieldOption", "source_object", "items", objectSelect);
    $('#events').jsGrid("fieldOption", "dest_object", "items", objectSelect);
    $('#modal').modal('hide');
});

socket.on('all_events', function (msg) {
    tableData = [];
    eventTimes = [0];
    for (var evt in msg) {
        tableData.push(msg[evt]);
        eventTimes.push(msg[evt].event_time);
    }
    var end = eventTimes.length - 1;
    if (end < 1)
        end = 1;
    dateSlider.noUiSlider.updateOptions({
        range: {
            min: 0,
            max: end
        },
        start: 0,
        handles: 1,
    }); 
    $('#events').jsGrid('loadData');
    $('#events').jsGrid('sort', 1, 'asc');
});

socket.on('change_object', function(msg) {
    var o = JSON.parse(msg);
    var selected = false;
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).uuid === o.uuid) {
            if (canvas.getActiveObject() && canvas.getActiveObject().uuid === o.uuid) {
                selected = true;
            }
            var to = canvas.item(i);
            if (o.type === 'object') {
                if (to.image !== o.image || to.fillColor !== o.fillColor) {
                    var children = to.children.length;
                    for (var k = 0; k < children; k++)
                        canvas.remove(to.children[k]);
                    canvas.remove(to);
                    addObjectToCanvas(o, selected);
                } else {
                    for (var k = 0; k < canvas.item(i).children.length;k ++) {
                        if (canvas.item(i).children[k].objType === 'name')
                            canvas.item(i).children[k].text = o.name;
                    }
                }
                canvas.renderAll();
            } else if (o.type === 'link') {
                canvas.item(i).stroke_color = o.stroke_color;
                canvas.item(i).stroke = o.stroke_color;
                canvas.renderAll();
            }
            break;
        }
    }
    $('#events').jsGrid("fieldOption", "source_object","items",objectSelect)
    $('#events').jsGrid("fieldOption", "dest_object","items",objectSelect)
});

socket.on('move_object', function (msg) {
    dirty = true;
    var o = JSON.parse(msg);
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).uuid == o.uuid) {
            canvas.item(i).dirty = true;
            canvas.item(i).scaleX = o.scale_x;
            canvas.item(i).scaleY = o.scale_y;
            canvas.item(i).animate({left: o.x, top: o.y}, {
                duration: 100,
                onChange: function() {
                    dirty = true;
                    canvas.item(i).dirty = true;
                    for (var j = 0; j < canvas.item(i).children.length; j++) {
                        canvas.item(i).children[j].setTop(canvas.item(i).getTop() + (canvas.item(i).getHeight()/2));
                        canvas.item(i).children[j].setLeft(canvas.item(i).getLeft());
                    }
                    canvas.renderAll();;
                }
            });
            console.log(o.z);
            canvas.item(i).moveTo(o.z);
            break;
        }
    }
});
    
socket.on('update_event', function(msg) {
    var evt = JSON.parse(msg);
    for (var i = 0; i < tableData.length; i++) {
        if (tableData[i].id === evt.id) {
            tableData[i] = evt;
        }
    }
    $('#events').jsGrid('loadData');
    $('#events').jsGrid('sort', 1, 'asc');
});    

socket.on('insert_event', function(msg) {
    var evt = JSON.parse(msg);
    tableData.push(evt);
    $('#events').jsGrid('insertItem', evt);
});

socket.on('delete_event', function(msg) {
    var evt = JSON.parse(msg);
    for (var i = 0; i < tableData.length; i++) {
        if (tableData[i].id === evt.id) {
            tableData.splice(i, 1);
            break;
        }
    }
    $('#events').jsGrid('loadData');
    $('#events').jsGrid('sort', 1, 'asc');
});

socket.on('insert_object', function(msg) {
    var o = JSON.parse(msg);
    addObjectToCanvas(o, false);
});

socket.on('insert_link', function(msg) {
    var o = JSON.parse(msg);
    addLinkToCanvas(o, false);
});

socket.on('delete_object', function(msg) {
    var uuid = JSON.parse(msg);
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).uuid == uuid) {
            var object = canvas.item(i);
            if (canvas.item(i).children !== undefined) {
                for (var k = 0; k < object.children.length; k++) {
                    canvas.remove(object.children[k]);
                }
            }
            canvas.remove(object);
            break;
        }
    }
    canvas.renderAll();
});

function zoomIn() {
    zoom += 0.1;
    canvas.setZoom(zoom);
}

function zoomOut() {
    zoom -= 0.1;
    canvas.setZoom(zoom);
}

function startPan(event) {
    if (event.button != 2) {
        return;
    }
    var x0 = event.screenX;
    var y0 = event.screenY;
    function continuePan(event) {
        var x = event.screenX,
            y = event.screenY;
        if (x - x0 != 0 || y - y0 != 0)
        {
            canvas.relativePan({ x: x - x0, y: y - y0 });
            x0 = x;
            y0 = y;
        }
    }
    function stopPan(event) {
        $(window).off('mousemove', continuePan);
        $(window).off('mouseup', stopPan);
    };
    $(window).mousemove(continuePan);
    $(window).mouseup(stopPan);
    $(window).contextmenu(cancelMenu);
};

$('#diagram').mousedown(startPan);

document.onkeydown = checkKey;
function checkKey(e) {
    e = e || window.event;
    if (e.keyCode == '38') {
        // up arrow
    }
    else if (e.keyCode == '40') {
        // down arrow
    }
    else if (e.keyCode == '37') {
       canvas.relativePan({ x: -5, y: 0 });
    }
    else if (e.keyCode == '39') {
       // right arrow
    }
}

function panit() {
    canvas.relativePan({ x: -1, y: 0 });
    setTimeout(function() { panit(); }, 10);
}

canvas.on('object:moving', function(options) {
    dirty = true;
    options.target.dirty = true;
    for (var j = 0; j < options.target.children.length; j++) {
        options.target.children[j].setTop(options.target.getTop() + (options.target.getHeight()/2));
        options.target.children[j].setLeft(options.target.getLeft());
    }
});

canvas.on('object:scaling', function(options) {
    dirty = true;
    options.target.dirty = true;
    for (var j = 0; j < options.target.children.length; j++) {
        options.target.children[j].setTop(options.target.getTop() + (options.target.getHeight()/2));
        options.target.children[j].setLeft(options.target.getLeft());
    }
});

canvas.on('object:modified', function(options) {
    console.log('modded');
    if (options.target) {
        if (canvas.getActiveObject() !== null) {
            var z = canvas.getObjects().indexOf(options.target);
            socket.emit('move_object', JSON.stringify({uuid: options.target.uuid, type: options.target.objType, x: options.target.left, y: options.target.top, z: z, scale_x: options.target.scaleX, scale_y: options.target.scaleY}));
        } else if (canvas.getActiveGroup() !== null) {
            for (var i = 0; i < options.target.getObjects().length; i++) {
                var left = options.target.getCenterPoint().x + options.target.item(i).left;
                var top = options.target.getCenterPoint().y + options.target.item(i).top;
                socket.emit('move_object', JSON.stringify({uuid: options.target.item(i).uuid, type: options.target.item(i).objType, x: left, y: top, z: z, scale_x: options.target.scaleX, scale_y: options.target.scaleY}));
            }
        }
    }
});

canvas.on('object:selected', function(options) {
    if (options.target) {
        if (canvas.getActiveObject() !== null && canvas.getActiveGroup() === null) {
            if (options.target.objType !== undefined) {
                if (creatingLink) {
                    if (options.target.objType === 'object' && firstNode !== options.target) {
                        if (firstNode === null) {
                            firstNode = options.target;
                            showMessage('Click on a second node to complete the link.');
                        } else {
                            showMessage('Link created.', 5);
                            $('#cancelLink').hide();
                            var z = canvas.getObjects().indexOf(firstNode) - 1;
                            if (canvas.getObjects().indexOf(options.target) < z)
                                z = canvas.getObjects().indexOf(options.target) - 1;
                            socket.emit('insert_link', JSON.stringify({mission: mission, name:$('#propName').val(), stroke_color:$('#propStrokeColor').val(), node_a: firstNode.uuid, node_b: options.target.uuid, z: z}));
                            firstNode = null;
                            creatingLink = false;
                        }
                    }
                } else {
                    console.log(canvas.getObjects().indexOf(options.target));
                    $('#propID').val(options.target.uuid);
                    $('#propFillColor').val(options.target.fillColor);
                    $('#propStrokeColor').val(options.target.strokeColor);
                    $('#propName').val('');
                    if (options.target.children !== undefined) {
                        for (var i = 0; i < options.target.children.length; i++) {
                            if (options.target.children[i].objType === 'name')
                                $('#propName').val(options.target.children[i].text);
                        }
                    }
                    if (options.target.objType === 'object') {
                        $('#propIcon').val(options.target.image);
                        $('#propIcon').data('picker').sync_picker_with_select();
                    }
                    openProperties(options.target.objType);
                }
            }
        } else {
            closeProperties();
        }
    }
});

canvas.on('before:selection:cleared', function(options) {
    if (!updatingObject)
        closeProperties();
});

canvas.on('before:render', function(e) {
    if (dirty) {
        for (var i = 0; i < canvas.getObjects().length; i++) {
            if (canvas.item(i).objType && canvas.item(i).objType === 'link') {
                var from = canvas.item(i).from;
                var to = canvas.item(i).to;
                var fromObj = null;
                var toObj = null;
                for (var j = 0; j < canvas.getObjects().length; j++) {
                    if (canvas.item(j).uuid === from) {
                        fromObj = canvas.item(j);
                    }
                    if (canvas.item(j).uuid === to) {
                        toObj = canvas.item(j);
                    }
                }
                if (fromObj && toObj && (fromObj.dirty || toObj.dirty)) {
                    canvas.item(i).set({ 'x1': fromObj.getCenterPoint().x, 'y1': fromObj.getCenterPoint().y });
                    canvas.item(i).set({ 'x2': toObj.getCenterPoint().x, 'y2': toObj.getCenterPoint().y });
                    for (var j = 0; j < canvas.item(i).children.length; j++) {
                        canvas.item(i).children[j].set({'left': canvas.item(i).getCenterPoint().x, 'top': canvas.item(i).getCenterPoint().y });
                        var angle = (Math.atan2((canvas.item(i).y1 - canvas.item(i).y2), (canvas.item(i).x1 - canvas.item(i).x2))) * (180/Math.PI);
                        if(Math.abs(angle) > 90)
                            angle += 180;
                        canvas.item(i).children[j].set({'angle': angle});
                    }
                }
            }
        }
        for (var i = 0; i < canvas.getObjects().length; i++) {
            if (canvas.item(i).objType && canvas.item(i).objType === 'link') {
                fromObj.dirty = false;
                toObj.dirty = false;
            }
        }
        if (tempLink) {
            tempLink.set({ 'x1': tempLink.from.getCenterPoint().x, 'y1': tempLink.from.getCenterPoint().y });
            tempLink.set({ 'x2': tempLink.to.getCenterPoint().x, 'y2': tempLink.to.getCenterPoint().y });
        }
        dirty = false;
    }
});

function cancelMenu() {
    $(window).off('contextmenu', cancelMenu);
    return false;
}

function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}

function addLinkToCanvas(o) {
    var fromObject = null;
    var toObject = null;
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).uuid == o.node_a) {
            fromObject = canvas.item(i);
        }
        if (canvas.item(i).uuid == o.node_b) {
            toObject = canvas.item(i);
        }
    }
    if (fromObject !== null && toObject !== null) {
        var from = fromObject.getCenterPoint();
        var to = toObject.getCenterPoint();
        var line = new fabric.Line([from.x, from.y, to.x, to.y], {
            isChild: false,
            uuid: o.uuid,
            objType: 'link',
            from: o.node_a,
            to: o.node_b,
            fill: 'black',
            stroke: o.stroke_color,
            strokeColor: o.stroke_color,
            strokeWidth: 3,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
        });
        var angle = (Math.atan2((line.y1 - line.y2), (line.x1 - line.x2))) * (180/Math.PI);
            if(Math.abs(angle) > 90)
                angle += 180;
        var name = new fabric.Text(o.name, {
            isChild: true,
            parent_uuid: o.uuid,
            objType: 'name',
            selectable: false,
            originX: 'center',
            textAlign: 'center',
            fill: o.stroke_color,
            angle: angle,
            fontSize: 10,
            left: line.getCenterPoint().x,
            top: line.getCenterPoint().y
        });
        line.children = [name];
        canvas.add(line);
        canvas.add(name);
        line.moveTo(o.z);
        name.moveTo(o.z+1);
    }
}

function addObjectToCanvas(o, select) {
    console.log(o.name,o.z);
    if (o.image !== undefined && o.image !== null) {
        var image, func;
        if (SVGCache[o.image] === undefined) {
            image = ('images/icons/' + o.image);
            func = fabric.loadSVGFromURL;
        } else {
            image = SVGCache[o.image];
            func = fabric.loadSVGFromString;
        }
        func(image, function(objects, options) {
            var name;
            var shape = fabric.util.groupSVGElements(objects, options);
            shape.set({
                isChild: false,
                fillColor: o.fill_color,
                strokeColor: o.stroke_color,
                scaleX: o.scale_x,
                scaleY: o.scale_y,
                uuid: o.uuid,
                objType: o.type,
                image: o.image,
                name: name,
                originX: 'center',
                originY: 'center',
                left: o.x,
                top: o.y,
            });
            if (shape.paths) {
                for (var i = 0; i < shape.paths.length; i++) {
                    if (shape.paths[i].fill !== 'rgba(254,254,254,1)' && shape.paths[i].fill !== '') {
                        shape.paths[i].setFill(o.fill_color);
                    }
                    if (shape.paths[i].stroke !== 'rgba(254,254,254,1)') {
                        shape.paths[i].setStroke(o.stroke_color);
                    }
                }
            }
            name = new fabric.Text(o.name, {
                isChild: true,
                parent_uuid: o.uuid,
                objType: 'name',
                selectable: false,
                originX: 'center',
                textAlign: 'center',
                fontSize: 14,
                left: o.x,
                top: o.y + (shape.getHeight()/2)
            });
            shape.children = [name];
            objectsLoaded.pop();
            canvas.add(shape);
            canvas.add(name);
            if (select)
                canvas.setActiveObject(shape);
            shape.moveTo(o.z);
            name.moveTo(o.z+1);
            //shape.bringToFront();
            //name.bringToFront();
        });
        $('#events').jsGrid("fieldOption", "source_object","items",objectSelect);
        $('#events').jsGrid("fieldOption", "dest_object","items",objectSelect);
    } else {
        objectsLoaded.pop();
    }
}

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function resize() {
    var displayWidth  = $('#diagram').parent().width();
    if ($('#properties').is(':hidden')) {
        $('#diagram').width(displayWidth - 60);
        canvas.setWidth($('#diagram').width());
        canvas.setHeight($('#diagram').height());
        canvas.calcOffset();
        canvas.renderAll();
    } else {
        $('#diagram').width(displayWidth - (310 + 45));
        canvas.setWidth($('#diagram').width());
        canvas.setHeight($('#diagram').height());
        canvas.calcOffset();
        canvas.renderAll();
    }
}

function insertLink() {
    closeProperties();
    creatingLink = true;
    showMessage('Click on a node to start a new link.');
    $('#cancelLink').show();
}

function cancelLink() {
    firstObject = null;
    creatingLink = false;
    showMessage('Link cancelled.',5);
    $('#cancelLink').hide();
}

function insertObject() {
    socket.emit('insert_object', JSON.stringify({mission: mission, name:$('#propName').val(), fill_color:$('#propFillColor').val(), stroke_color:$('#propStrokeColor').val(), image:$('#propIcon').val(), type:$('#propType').val()})); 
}

function deleteObject() {
    if (canvas.getActiveObject().uuid) {
        socket.emit('delete_object', JSON.stringify({uuid:canvas.getActiveObject().uuid, type:canvas.getActiveObject().objType}));
    }
}

function moveToFront() {
    if (canvas.getActiveObject().uuid) {
        canvas.getActiveObject().bringToFront();
        for (var i = 0; i < canvas.getActiveObject().children.length; i++) {
            canvas.getActiveObject().children[i].bringToFront();
        }
        canvas.trigger('object:modified');
    }
}

function moveToBack() {
    if (canvas.getActiveObject().uuid) {
        for (var i = 0; i < canvas.getActiveObject().children.length; i++) {
            canvas.getActiveObject().children[i].sendToBack();
        }
        canvas.getActiveObject().sendToBack();
        canvas.trigger('object:modified');
    }
}

function moveUp() {
    if (canvas.getActiveObject().uuid) {
        canvas.getActiveObject().bringForward();
        canvas.trigger('object:modified');
    }
}

function moveDown() {
    if (canvas.getActiveObject().uuid) {
        canvas.getActiveObject().sendBackwards();
        canvas.trigger('object:modified');
    }
}

function showMessage(msg, timeout) {
    $('#message').html(msg);
    if (timeout !== undefined) {
        setTimeout(function() {
            $('#message').html('');
        }, timeout * 1000);
    }
}

function updatePropName(name) {
    if (canvas.getActiveObject()) {
        for (var i = 0; i < canvas.getActiveObject().children.length; i++) {
            if (canvas.getActiveObject().children[i].objType === 'name')
                canvas.getActiveObject().children[i].text = name;
        }
        for (var i = 0; i < objectSelect.length; i++) {
            if (objectSelect[i].uuid === canvas.getActiveObject().uuid) {
                objectSelect[i].name = name;
                break;
            }
        }
        canvas.renderAll();
        changeObject(canvas.getActiveObject());
        $('#events').jsGrid("fieldOption", "source_object","items",objectSelect)
        $('#events').jsGrid("fieldOption", "dest_object","items",objectSelect)
    }
}

function updatePropFillColor(color) {
    if (canvas.getActiveObject() && canvas.getActiveObject().objType === 'object') {
        canvas.getActiveObject().fillColor = color;
        if (canvas.getActiveObject().paths) {
            for (var j = 0; j < canvas.getActiveObject().paths.length; j++) {
                if (canvas.getActiveObject().paths[j].fill !== 'rgba(254,254,254,1)')
                    canvas.getActiveObject().paths[j].setFill(canvas.getActiveObject().fillColor);
            }
        }
        canvas.renderAll();
        changeObject(canvas.getActiveObject());
    }
}

function updatePropStrokeColor(color) {
    if (canvas.getActiveObject()) {
        canvas.getActiveObject().strokeColor = color;
        if (canvas.getActiveObject().objType === 'object') {
            if (canvas.getActiveObject().paths) {
                for (var j = 0; j < canvas.getActiveObject().paths.length; j++) {
                    if (canvas.getActiveObject().paths[j].stroke !== 'rgba(254,254,254,1)')
                        canvas.getActiveObject().paths[j].setStroke(canvas.getActiveObject().strokeColor);
                }
            }
        } else if (canvas.getActiveObject().objType === 'link') {
            canvas.getActiveObject().stroke = color;
        }
        canvas.renderAll();
        changeObject(canvas.getActiveObject());
    }
}

function changeObject(o) {
    var tempObj = {};
    if (o.objType === 'object') {
        tempObj.uuid = o.uuid;
        tempObj.x = o.left;
        tempObj.y = o.top;
        tempObj.scale_x = o.scaleX;
        tempObj.scale_y = o.scaleY;
        tempObj.type = o.objType;
        tempObj.fill_color = o.fillColor;
        tempObj.stroke_color = o.strokeColor;
        tempObj.image = o.image;
        tempObj.name = '';
        for (var i=0; i < o.children.length; i++) {
            if (o.children[i].objType === 'name') {
                tempObj.name = o.children[i].text;
            }
        }
    } else if (o.objType === 'link') {
        tempObj.uuid = o.uuid;
        tempObj.type = o.objType;
        tempObj.stroke_color = o.strokeColor;
        tempObj.name = '';
        for (var i=0; i < o.children.length; i++) {
            if (o.children[i].objType === 'name') {
                tempObj.name = o.children[i].text;
            }
        }
    }
    socket.emit('change_object', JSON.stringify(tempObj));
}

function toggleProperties(type) {
    canvas.deactivateAll().renderAll();
    if ($('#properties').is(':hidden')) {
        openProperties(type);
    } else {
        if ($('#propType').val() === type)
            closeProperties();
        else
            openProperties(type);
    }
}

function openProperties(type) {
    // edit
    $('#propType').val(type);
    if (canvas.getActiveObject()) {
        if (type === 'object') {
            $('#propTitle').html('Edit Object');
            $('#propNameGroup').show();
            $('#propShapeGroup').hide();
            $('#propIconGroup').show();
            $('#propFillColor').show();
            $('#editDetailsButton').show();
            $('#deleteObjectButton').show();
            $('#insertObjectButton').hide();
            $('#insertLinkButton').hide();
            $('#objectsButton').css('background-color','lightgray');
            $('#linksButton').css('background-color','darkgray');
        } else if (type === 'link') {
            $('#propTitle').html('Edit Link');
            $('#propNameGroup').show();
            $('#propIconGroup').hide();
            $('#propFillColor').hide();
            $('#deleteObjectButton').show();
            $('#deleteLinkButton').show();
            $('#insertObjectButton').hide();
            $('#insertLinkButton').hide();
            $('#linksButton').css('background-color','lightgray');
            $('#objectsButton').css('background-color','darkgray');
        } else {
            closeProperties();
            return;
        }
    // new
    } else if (canvas.getActiveObject() === undefined || canvas.getActiveObject() === null) {
        if (type === 'object') {
            $('#propTitle').html('New Object');
            $('#propID').val('');
            $('#propType').val('object');
            $('#propNameGroup').show();
            $('#propName').val('');
            $('#propFillColor').show();
            $('#propFillColor').val('#000000');
            $('#propStrokeColor').val('#ffffff');
            $('#propShapeGroup').hide();
            $('#propIconGroup').show();
            $('#propIcon').val('00-000-hub.svg');
            $('#propIcon').data('picker').sync_picker_with_select();
            $('#editDetailsButton').hide();
            $('#deleteObjectButton').hide();
            $('#insertObjectButton').show();
            $('#insertLinkButton').hide();
            $('#objectsButton').css('background-color','lightgray');
            $('#linksButton').css('background-color','darkgray');
        } else if (type === 'link') {
            $('#propTitle').html('New Link');
            $('#propID').val('');
            $('#propType').val('link');
            $('#propNameGroup').show();
            $('#propName').val('');
            $('#propStrokeColor').val('#a9a9a9');
            $('#propFillColor').hide();
            $('#propFillColor').val('#000000');
            $('#propShapeGroup').hide();
            $('#propIconGroup').hide();
            $('#editDetailsButton').hide();
            $('#deleteObjectButton').hide();
            $('#insertObjectButton').hide();
            $('#insertLinkButton').show();
            $('#linksButton').css('background-color','lightgray');
            $('#objectsButton').css('background-color','darkgray');
        }
    } else {
        return;
    }
    if ($('#properties').is(':hidden')) {
        $('#properties').show();
        $('#diagram').width($('#diagram').width() - 310);
    }
    resize();
}

function closeProperties() {
    $('#properties').hide();
    $('#diagram').width('100%');
    $('#objectsButton').css('background-color','darkgray');
    $('#linksButton').css('background-color','darkgray');
    resize();
}

function timestamp(str){
    return new Date(str).getTime();   
}

$(document).ready(function() {
    mission = getParameterByName('mission');
    resize();
    $('#propIcon').imagepicker({
        hide_select : true,
        selected : function() {
            if (canvas.getActiveObject() !== null && canvas.getActiveObject().objType === 'object') {
                canvas.getActiveObject().image = $(this).val();
                fabric.loadSVGFromURL('images/icons/' + $(this).val(), function(objects, options) {
                    var shape = fabric.util.groupSVGElements(objects, options);
                    shape.set({
                        uuid: canvas.getActiveObject().uuid,
                        originX: 'center',
                        originY: 'center',
                        fillColor: canvas.getActiveObject().fillColor,
                        strokeColor: canvas.getActiveObject().strokeColor,
                        objType: canvas.getActiveObject().objType,
                        image: canvas.getActiveObject().image,
                        left: canvas.getActiveObject().getCenterPoint().x,
                        top: canvas.getActiveObject().getCenterPoint().y,
                        children: canvas.getActiveObject().children
                    });
                    if (shape.paths) {
                        for (var j = 0; j < shape.paths.length; j++) {
                            if (shape.paths[j].fill !== 'rgba(254,254,254,1)')
                                shape.paths[j].setFill(shape.fillColor);
                            if (shape.paths[j].stroke !== 'rgba(254,254,254,1)')
                                shape.paths[j].setStroke(shape.strokeColor);
                        }
                    }
                    canvas.remove(canvas.getActiveObject());
                    canvas.add(shape);
                    updatingObject = true;
                    canvas.setActiveObject(canvas.item(canvas.getObjects().length-1));
                    updatingObject = false;
                    canvas.renderAll();
                });
                changeObject(canvas.getActiveObject());
            }
        }
    });

    dateSlider = document.getElementById('slider');
    noUiSlider.create(dateSlider, {
        range: {
            min: 0,
            max: 1
        },
        step: 1,
        start: [0]
    });

    dateSlider.noUiSlider.on('update', function(values, handle) {
        var filter = eventTimes[parseInt(values[handle])];
        if (tempLink) {
            canvas.remove(tempLink);
            tempLink = null;
        }
        for (var j = 0; j < canvas.getObjects().length; j++)
            canvas.item(j).setShadow(null);
        for (var i = 0; i < tableData.length; i++) {
            if (tableData[i].event_time === filter) {
                var from = null;
                var to = null;
                $('#events').jsGrid("rowByItem",tableData[i]).addClass('highlight');
                for (var j = 0; j < canvas.getObjects().length; j++) {
                    if (canvas.item(j).uuid === tableData[i].source_object || canvas.item(j).uuid === tableData[i].dest_object) {
                        if (canvas.item(j).uuid === tableData[i].source_object)
                            from = canvas.item(j);
                        else if (canvas.item(j).uuid === tableData[i].dest_object)
                            to = canvas.item(j);
                        //canvas.item(j).setShadow("0px 0px 50px rgba(255, 0, 0, 1.0)");
                        canvas.item(j).setShadow({color: 'red', offsetX: 2, offsetY:2, blur: 5});
                    }
                    if (from && to) {
                        var line = new fabric.Line([from.getCenterPoint().x, from.getCenterPoint().y, to.getCenterPoint().x, to.getCenterPoint().y], {
                            from: from,
                            to: to,
                            stroke: 'red',
                            strokeColor: 'red',
                            strokeWidth: 5,
                            hasControls: false,
                            lockMovementX: true,
                            lockMovementY: true,
                            lockScalingX: true,
                            lockScalingY: true,
                            lockRotation: true,
                        });
                        tempLink = line;
                        canvas.add(line);
                        line.sendToBack();
                        canvas.renderAll();
                        break;
                    }
                }
            } else {
                $('#events').jsGrid("rowByItem",tableData[i]).removeClass('highlight');
            }
        }
        canvas.renderAll();
    });

    var dj = document.getElementById('diagram_jumbotron');
    new ResizeSensor(dj, function() {
        resize();
    });

    $('#events').jsGrid({
        autoload: false,
        width: '100%',
        height: '400px',
        editing: true,
        sorting: true,
        paging: true,
        fields: [
            { name: 'id', type: 'number', css: 'hide', width: 0},
            { name: 'event_time', title: 'Event Time', type : 'date', width: 65},
            { name: 'source_object', title: 'Source Object', type: 'select', items: objectSelect, valueField: 'uuid', textField: 'name', width: 65, filterValue: function() {
                    return this.items[this.filterControl.val()][this.textField];
                }
            },
            { name: 'source_port', title: 'SPort', type: 'number', width: 25},
            { name: 'dest_object', title: 'Destination Object', type: 'select', items: objectSelect, valueField: 'uuid', textField: 'name', width: 65, filterValue: function() {
                    return this.items[this.filterControl.val()][this.textField];
                }
            },
            { name: 'dest_port', title: 'DPort', type: 'number', width: 25},
            { name: 'event_type', title: 'Event Type', type: 'text'},
            { name: 'short_desc', title: 'Event Text', type: 'text'},
            { name: 'analyst', title: 'Analyst', type: 'text', width: 50, readOnly: true},
            { 
                type: "control",
                editButton: false,
                headerTemplate: function() {
                    var grid = this._grid;
                    var isInserting = grid.inserting;

                    var $button = $("<input>").attr("type", "button")
                        .addClass([this.buttonClass, this.modeButtonClass, this.insertModeButtonClass].join(" "))
                        .on("click", function() {
                            isInserting = !isInserting;
                            grid.option("inserting", isInserting);
                        });

                    return $button;
                }
            }
        ],
        controller: {
            loadData: function () {
                return Object.keys(tableData).map(function (key) { return tableData[key]; });
            },
            insertItem: function(item) {
                if (item.id === 0) {
                    item.mission = mission;
                    socket.emit('insert_event', JSON.stringify(item));
                    eventTimes.push(item.event_time);
                    dateSlider.noUiSlider.updateOptions({
                        range: {
                            min: 0,
                            max: eventTimes.length-1
                        },
                        start: 0,
                        handles: 1,
                    });
                }
                return item;
            },
            updateItem: function(item) {
                socket.emit('update_event', JSON.stringify(item));
                tableData[item['id']] = item;
            },
            deleteItem: function(item) {
                socket.emit('delete_event', JSON.stringify(item));
            }
        },
        loadStrategy: function() {
            return new CustomDirectLoadStrategy(this);
        },
        rowClick: function(args) {
            var $row = $(args.event.target).closest("tr");
            if(this._editingRow) {
                this.updateItem().done($.proxy(function() {
                    this.editing && this.editItem($row);
                }, this));
                return;
            }
            this.editing && this.editItem($row);
        }
    });
});

$(function() {
    $('.tabs nav a').on('click', function() {
        show_content($(this).index());
    });
    show_content(0);
    function show_content(index) {
        $('.tabs .content.visible').removeClass('visible');
        $('.tabs .content:nth-of-type(' + (index + 1) + ')').addClass('visible');
        $('.tabs nav a.selected').removeClass('selected');
        $('.tabs nav a:nth-of-type(' + (index + 1) + ')').addClass('selected');
    }
});
