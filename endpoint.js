var __domParser = new DOMParser();


function createResponseFromXML(xmlDocument) {
    var serialized = new XMLSerializer().serializeToString(xmlDocument);
    return new Response({xml: serialized });
}

function Response(fromResponse) {
    this.raw = fromResponse.xml;
    this.domNode = __domParser.parseFromString(fromResponse.xml, "application/xml")

    var that = this

    this.transform = function(stylesheetURL, params, callback) {
	console.log("requresting stylesheet url " + stylesheetURL)
	$.get(stylesheetURL, function(resp, other){
	    xsltProcessor = new XSLTProcessor();
	    xsltProcessor.importStylesheet(resp);

	    for (k in params) {
	    	xsltProcessor.setParameter(null, k, params[k]);
	    }
	    
	    resultDocument = xsltProcessor.transformToFragment(that.domNode, document);
	    var serialized = new XMLSerializer().serializeToString(resultDocument);
	    callback(new Response({xml: serialized}))
	});
    }
    this.htmlNode = function() {
	return __domParser.parseFromString(that.raw, "text/html")
    }
    this.htmlDocument = this.htmlNode
    this.xmlDocument = this.domNode
    
}

function randomId() {
    return window.crypto.getRandomValues(new Uint32Array(1))[0]
}


function Endpoint() {
    
    return {
	startstream: function() {
	    document.addEventListener('DOMContentLoaded', function(){

		var streamElements = document.getElementsByTagName("stream")
		var firstStream = streamElements[0]
		console.log(firstStream)
		var wsPath = firstStream.getAttribute("src")
		var transformationPath = firstStream.getAttribute("transform")
		var subscription = firstStream.getAttribute("subscription")
		var init = firstStream.getAttribute("init")
		var params = {};


		var actionTag = null;
		var actionToggle = null;
		var actionURL = null;
		var payloadMapping = {}
		for (var i = 0; i < firstStream.children.length; i++) {
		    var el = firstStream.children[i]
		    if (el.tagName == "XSLTPARAMS") {
			for (var k = 0; k < el.children.length; k++) {
			    var param = el.children[k]
			    if (param.tagName == "PARAM") {
				var key = param.getAttribute("key")
				var value = param.getAttribute("value")

				params[key] = value
			    }
			}
		    } else if (el.tagName == "ACTION") {
			for (var k = 0; k < el.children.length; k++) {
			    var actionChild = el.children[k]
			    if (actionChild.tagName == "TAG") {
				actionTag = actionChild.getAttribute("value")
				actionToggle = actionChild.getAttribute("addactionwhenpresent")
			    } else if (actionChild.tagName == "METHOD") {
				//always use post now
			    } else if (actionChild.tagName == "URL") {
				actionURL = actionChild.getAttribute("value")
			    } else if (actionChild.tagName == "CONTENT") {
				for(var j = 0; j < actionChild.children.length; j++) {
				    var contentChild = actionChild.children[j];
				    if (contentChild.tagName == "PAYLOAD") {
					var key = contentChild.getAttribute("key")
					var tag = contentChild.getAttribute("tag")
					payloadMapping[key] = tag
				    }
				}
			    }
			    
			}
		    }

		}
		console.log(params)
		console.log(payloadMapping)

		function updateLinks(element) {
		    var elements = element.getElementsByTagName(actionTag)
		    for (var k = 0; k < elements.length; k++) {
			var el = elements[k]
			
			if (el.getAttribute(actionToggle) == null) {
			    continue
			}

			el.setAttribute(actionToggle, "")
			el.addEventListener("click", function(el){
			    var clicked = el.currentTarget

			    var data = {}
			    for (key in payloadMapping) {
				var mapped = payloadMapping[key]
				data[key] = clicked.getAttribute(mapped)
			    }
			    
			    console.log(data)


			    var bodyData = undefined
			    var contentType = undefined
			    var urlEncodedDataPairs = [];
			    for(name in data) {
				urlEncodedDataPairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(data[name]));
			    }
			    bodyData = urlEncodedDataPairs.join('&').replace(/%20/g, '+');
			    contentType = "application/x-www-form-urlencoded"
			    console.log("posting")
			    console.log(actionURL)
    			    $.ajax({
    	    			type: 'POST',
    	    			url: actionURL,
    	    			data: bodyData,
    	    			contentType: contentType,
    	    			success: function(data) {
    	    			    console.log("posted")
				},
				error: function (responseData, textStatus, errorThrown) {
				    console.log(responseData)
				    console.log(textStatus)
				}
			    });


			    
			})
		    }
		}
		
		var action = function(response) {
			if(transformationPath != null) {
			    //var xslParams = {"gameId": gameId, "playerId": playerId, host: "localhost"}
			    response.transform(transformationPath, params, function(element) {
				firstStream.innerHTML = element.raw
				updateLinks(firstStream)
			    });
			} else {
			    firstStream.innerHTML = response.raw
			    updateLinks(firstStream)
			}
		    }
		
		//open the websocket
		var that = this
		document["__endpoint"] = this	    
		var ws = $.websocket(wsPath, {
		    open: function() {
			console.log("connected websocket")
			this.send("subscribe", [subscription])
			
		    },
		    events: {
			//default answer
			xmlresponse: function(el) {
			    var resp = new Response(el)
			    action(resp)
			}
		    }
		});

		if(init != null) {
		     $.get(init, function(resp, other) {
			 var response = createResponseFromXML(resp)
			 action(response)
		     });
		}
	    }, false);
	    
	},
	
	configuration : {
	    ws_path: "ws://localhost:8080",
	    use_router: false
	},
	__callbacks: {},
	callback: undefined,
	start : function(config, messagesToSubscribe, callback) {

	    this.configuration.ws_path = config.ws_path || this.configuration.ws_path
	    this.configuration.use_router = config.use_router || this.configuration.use_router
	    this.callback = callback;

	    //open the websocket
	    var that = this
	    document["__endpoint"] = this	    
	    var ws = $.websocket(this.configuration.ws_path, {
				     open: function() {
					 console.log("connected websocket")
					 this.send("subscribe", messagesToSubscribe)
				     },
				     events: {
					 //default answer
					 xmlresponse: function(response) {
					     var resp = new Response(response)
					     var foundCallback = that.__callbacks[response.rid]
					     if (foundCallback == undefined) {
						 console.log("general message, forward")
						 that.callback(resp)
					     } else {
						 console.log("returning to specific handler")
						 foundCallback(resp)
					     }
					     
					 }
				     }
				 });
	},
	GET: function(url, callback) {
	    var that = this	    
	    $.get(url, function(resp, other) {
		if(callback != undefined) {
		    var response = createResponseFromXML(resp)
		    callback(response)
		}		
	    });
	},
	PUT: function(url, data, callback) {
	    
	    var wrappedMessage = { 'payload': data }
	    
	    $.ajax({
		type: 'PUT',
		url: url,
		data: JSON.stringify (wrappedMessage),
		contentType: "application/json",
		dataType: 'json',
		success: function(data) {
		    if(callback != undefined) {
			callback(data)
		    }
		}
	    });
	},
	POST: function(url, data, channel, callback) {
	    console.log("got post to " + url)
	    var randomID = randomId()
	    this.__callbacks[randomID] = callback
	    
	    var bodyData = undefined
	    var contentType = undefined
	    
	    if (this.configuration.use_router) {
		var wrappedMessage = { 'payload': data, 'rid': randomID, "channel": channel}
		bodyData = JSON.stringify (wrappedMessage)
		contentType = "application/json"
	    } else {
		var urlEncodedDataPairs = [];
		for(name in data) {
		    urlEncodedDataPairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(data[name]));
		}
		bodyData = urlEncodedDataPairs.join('&').replace(/%20/g, '+');
		contentType = "application/x-www-form-urlencoded"
	    }
	    
    	    $.ajax({
    	    	type: 'POST',
    	    	url: url,
    	    	data: bodyData,
    	    	contentType: contentType,
    	    	success: function(data) {
    	    		if(callback != undefined) {
    	    		    callback(data)
    	    		}
		},
		error: function (responseData, textStatus, errorThrown) {
		    console.log(responseData)
		    console.log(textStatus)
		 }
	    });
	},
	DELETE: function(url, callback) {
	    $.ajax({
		type: 'DELETE',
		url: url,
		success: function(data) {
		    if(callback != undefined) {
			callback(data)
		    }		    
		}
	    });	
	}
    }
}
