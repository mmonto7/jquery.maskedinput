(function($) {

    function setCaret(elm,begin,end){
        end = (typeof end === 'number') ? end : begin;

        if (elm.setSelectionRange) {
            elm.setSelectionRange(begin, end);
        } else if (elm.createTextRange) {
            var range = elm.createTextRange();
            range.collapse(true);
            range.moveEnd('character', end);
            range.moveStart('character', begin);
            range.select();
        }
    }

    function getCaret(elm){
        var begin,end;
        if (elm.setSelectionRange) {
            begin = elm.selectionStart;
            end = elm.selectionEnd;
        } else if (document.selection && document.selection.createRange) {
            var range = document.selection.createRange();
            begin = 0 - range.duplicate().moveStart('character', -100000);
            end = begin + range.text.length;
        }
        return { begin: begin, end: end };
    }

    $.mask = {
        masks:[],
        //Predefined character definitions
        //TODO: Move these to the mask def itself.
        definitions: {
            '9': "[0-9]",
            'a': "[A-Za-z]",
            '*': "[A-Za-z0-9]"
        },
        autoclear: true,
        dataName: "maskedinput",
        placeholder: '_'
    };

    function FixedWidthMask (mask, settings){
        var self=this;
        //Build up structures necessary to quickly apply masking
        this.settings = settings;

        this.tests = [];
        this.partialPosition = mask.length;
        this.length = mask.length;

        var firstNonMaskPos = null;

        $.each(mask.split(""), function(i, c) {
            if (c == '?') {
                self.length--;
                self.partialPosition = i;
            } else if (settings.definitions[c]) {
                self.tests.push(new RegExp(settings.definitions[c]));
                if (firstNonMaskPos === null) {
                    firstNonMaskPos = self.tests.length - 1;
                }
            } else {
                self.tests.push(c);
            }
        });
    }

    FixedWidthMask.prototype.applyBackspace = function(input, pos){
        var i, buffer = input.split('');
        for(i = pos - 1; i >= 0; i--){
                if(this.tests[i].test)
                    break
        }
        buffer.splice(i, 1);
        return this.apply(buffer.join(''), i);
    }

    FixedWidthMask.prototype.applyDelete = function(input, pos){
        var i, buffer = input.split('');
        for(i = pos; i < buffer.length; i++){
                if(this.tests[i].test)
                    break
        }
        buffer.splice(i, 1);
        var result=this.apply(buffer.join(''), i);
        result.pos=i;
        return result;
    }

    FixedWidthMask.prototype.apply = function(input, caretPosition){
        if(caretPosition == null)
            caretPosition = 0;
        var buffer=[],
            raw=[],
            lastMatch = -1,
            i,
            action,
            pos;

        for (i = 0, pos = 0; i < this.length; i++) {
            var action=this.tests[i];

            if (action.test) {
                buffer.push(this.settings.placeholder);

                while (pos++ < input.length) {
                    c = input.charAt(pos - 1);
                    if (action.test(c)) {
                        buffer[i] = c;
                        raw.push(c)
                        lastMatch = i;
                        break;
                    }
                }
            } else {
                buffer.push(action);
                if(action === input.charAt(pos) && i !== this.partialPosition) {
                    pos++;
                    lastMatch=i;
                }
            }
        }

        //Find the next spot waiting for input
        var maxCaret=Math.min(caretPosition,this.length);
        for(i=Math.max(lastMatch+1,maxCaret);i<this.length;i++){
            if(this.tests[i].test)
            break
        }

        var result={
            value: buffer.join(''),
            raw: raw.join(''), //TODO: separate unmask call?
            pos: i , //(partialPosition ? i : firstNonMaskPos)
            isComplete: (lastMatch + 1) >= this.partialPosition
        };
        console.log(result);
        return result;
    }

    function getPasteEvent() {
        var el = document.createElement('input'),
        name = 'onpaste';
        el.setAttribute(name, '');
        return (typeof el[name] === 'function')?'paste':'input';
    }

    var pasteEventName = getPasteEvent() + ".mask",
    ua = navigator.userAgent,
    iPhone = /iphone/i.test(ua),
    chrome = /chrome/i.test(ua),
    android=/android/i.test(ua),
    caretTimeoutId;



    $.fn.extend({
        //TODO: Be a good citizen and get this down to only .mask()
        unmask: function() {
            return this.trigger("unmask");
        },
        //TODO: we need a conflict thing here, maybe only use maskedinput(or alias?)
        mask: function(mask, settings) {
            var input,
            defs,
            tests,
            partialPosition,
            firstNonMaskPos,
            len;

            //TODO: make these more in line with newer plugin interaction guidelines.
            if (!mask && this.length > 0) {
                 input = $(this[0]);
                 return input.data($.mask.dataName).apply(input.val()).raw;
            }

            settings = $.extend({
                definitions: $.mask.definitions,
                autoclear: $.mask.autoclear,
                placeholder: $.mask.placeholder,
                completed: null
            }, settings);

            var mask=new FixedWidthMask(mask,settings);


            return this.trigger("unmask").each(function() {
                var elm = this,
                input = $(this),
                focusText = elm.value;

                function blurEvent(e) {
                    if(settings.autoclear){
                        var result = mask.apply(elm.value, 0);
                        if(!result.isComplete){
                            elm.value = "";
                        }
                    }

                    if (elm.value != focusText){
                        input.change();
                    }
                }

                function keydownEvent(e) {
                    var k = e.which;

                    //backspace, delete, enter, and escape get special treatment
                    if (k === 8 || k === 46) {
                        var pos = getCaret(elm);
                        var result;

                        if(pos.begin != pos.end){
                            var buffer = elm.value.split('');
                            buffer.splice(pos.begin,pos.end - pos.begin);
                            result = mask.apply(buffer.join(''), pos.begin+1);
                            result.pos = pos.begin;
                        }else{
                            if(k==8){
                                result = mask.applyBackspace(elm.value, pos.begin);
                            }else{
                                result = mask.applyDelete(elm.value, pos.begin);
                            }
                        }

                        elm.value = result.value;
                        setCaret(elm, result.pos);
                        e.preventDefault();
                    } else if(k === 13) { // enter
                        blurEvent.call(this, e);
                    } else if (k === 27) { // escape
                        elm.value = focusText;
                        setCaret(elm, 0, focusText.length);
                        e.preventDefault();
                    }
                }

                function keypressEvent(e) {
                    var k = e.which,
                    pos = getCaret(elm);

                    if (e.ctrlKey || e.altKey || e.metaKey || k < 32) {//Ignore
                        return;
                    } else if (k && k !== 13) {
                        var buffer = elm.value.split('');
                        buffer.splice(pos.begin, pos.end - pos.begin, String.fromCharCode(k));
                        var result = mask.apply(buffer.join(''), pos.begin+1);

                        elm.value = result.value;
                        setCaret(elm, result.pos);
                        if(result.isComplete && settings.completed)
                            settings.completed.call(input); //TODO: Raise event instead.
                        e.preventDefault();

                        // if(android){
                        //     //Path for CSP Violation on FireFox OS 1.1
                        //     var proxy = function()
                        //     {
                        //
                        //         $.proxy(setCaret,elm,next);
                        //     }
                        //
                        //     setTimeout(proxy,0);
                        // }else{
                        //     setCaret(elm,next);
                        // }
                    }
                }

                var caretTimeoutId;
                function focusEvent(e){
                    clearTimeout(caretTimeoutId);
                    var result = mask.apply(elm.value, 0);
                    focusText = elm.value;

                    caretTimeoutId = setTimeout(function(){
                        elm.value = result.value;
                        if (result.isComplete) {
                            setCaret(elm, 0, result.pos);
                        } else {
                            setCaret(elm, result.pos);
                        }
                    }, 10);
                }

                function pasteEvent(e){
                    setTimeout(function() {
                        var pos = getCaret(elm);
                        var result = mask.apply(elm.value, pos.end);
                        elm.value = result.value;
                        setCaret(elm, result.pos);
                        if(result.isComplete && settings.completed)
                            settings.completed.call(input); //TODO: Raise event instead.
                    }, 0);
                }
                input.data($.mask.dataName,mask);

                if (!input.attr("readonly"))
                input
                .one("unmask", function() {
                    input
                    .off(".mask")
                    .removeData($.mask.dataName);
                })
                .on("focus.mask",focusEvent)
                .on("blur.mask", blurEvent)
                .on("keydown.mask", keydownEvent)
                .on("keypress.mask", keypressEvent)
                .on(pasteEventName, pasteEvent);

                // if (chrome && android) {
                //     input.on("keyup.mask", keypressEvent);
                // }

                //Apply initital mask
                if(elm.value.length){
                    var result=mask.apply(elm.value, 0);
                    elm.value = result.value;
                }
            });
        }
    });
})(jQuery);
