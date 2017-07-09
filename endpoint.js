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
