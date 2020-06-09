/*
MIT License

Copyright (c) 2017 Pierre Lepers (pierre[dot]lepers[at]gmail[dot]com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

function rect_wh(w, h) {
  this.w = 0|w;
  this.h = 0|h;
}

rect_wh.prototype = {
  area : function(){
    return this.w*this.h;
  },

  perimeter : function(){
    return 2.0*this.w + 2.0*this.h;
  },

  fits : function( r ){
    if(this.w === r.w && this.h === r.h) return 3;
    if(this.h === r.w && this.w === r.h) return 4;
    if(this.w <=  r.w && this.h <=  r.h) return 1;
    if(this.h <=  r.w && this.w <=  r.h) return 2;
    return 0;
  }
};

function rect_ltrb(l,t,r,b){
  this.l = 0|l;
  this.t = 0|t;
  this.r = 0|r;
  this.b = 0|b;
}

rect_ltrb.prototype = {
  w: function(){
    return 0|(this.r - this.l);
  },

  h: function(){
    return 0|(this.b - this.t);
  },

  area: function(){
    return this.w()*this.h();
  },

  perimeter: function(){
    return 2.0*this.w() + 2.0*this.h();
  },

  setW: function(ww){
    this.r = 0|(this.l+ww);
  },

  setH: function(hh){
    this.b = 0|(this.t+hh);
  },

  to_rect_xywh : function(){
    let r = new rect_xywh( this.l, this.t );
    r.setR(this.r);
    r.setB(this.b);
    return r;
  }

};

function rect_xywh(x,y,w,h){
  rect_wh.call( this,w,h );

  this.x = 0|x;
  this.y = 0|y;
}

rect_xywh.prototype = Object.create( rect_wh.prototype );
rect_xywh.prototype.constructor = rect_xywh;

rect_xywh.prototype.r = function(){
  return 0|(this.x+this.w);
}

rect_xywh.prototype.b = function(){
  return 0|(this.y+this.h);
}

rect_xywh.prototype.setR = function(rr){
  this.w = 0|(rr - this.x);
}

rect_xywh.prototype.setB = function(bb){
  this.h = 0|(bb - this.y);
}

function rect_xywhf(x,y,w,h){
  rect_xywh.call( this,x,y,w,h );
  this.flipped = false;
}

rect_xywhf.prototype = Object.create( rect_xywh.prototype );
rect_xywhf.prototype.constructor = rect_xywhf;

rect_xywhf.prototype.flip = function(){
  this.flipped = !this.flipped;
  let t =  0|(this.w);
  this.w = 0|(this.h);
  this.h = 0|(t);
}

rect_xywhf.prototype.clone = function(){
  let res = new rect_xywhf(this.x, this.y, this.w, this.h)
  res.flipped = this.flipped;
  return res;
}

function bin() {
  this.size = new rect_wh(0, 0);
  this.rects = [];// rect_xywhf
}

function pnode(){
  this.pn = null;
  this.fill = false;
}

pnode.prototype = {

  Set : function(l,t,r,b){
    l = 0|l;
    t = 0|t;
    r = 0|r;
    b = 0|b;

    if(!this.pn) this.pn = new node( new rect_ltrb(l, t, r, b));
    else {
      this.pn.rc = new rect_ltrb(l, t, r, b);
      this.pn.id = false;
    }
    this.fill = true;
  }

};

function node( rect_ltrb ){
  this.c0 = new pnode();
  this.c1 = new pnode();
  this.rc = rect_ltrb;
  this.id = false;
}

node.prototype = {

  reset : function(rect_wh){
    this.id = false;
    this.rc = new rect_ltrb(0, 0, rect_wh.w, rect_wh.h);
    this.delcheck();
  },

  insert : function(rect_xywhf){

    if(this.c0.pn != null && this.c0.fill) {
      let newn = this.c0.pn.insert(rect_xywhf);
      if( newn != null ) return newn;
      return    this.c1.pn.insert(rect_xywhf);
    }

    if(this.id) return null;
    let f = rect_xywhf.fits( this.rc.to_rect_xywh() );

    switch(f) {
      case 0: return null;
      case 1: rect_xywhf.flipped = false; break;
      case 2: rect_xywhf.flipped = true; break;
      case 3: this.id = true; rect_xywhf.flipped = false; return this;
      case 4: this.id = true; rect_xywhf.flipped = true;  return this;
    }

    let iw = 0|(rect_xywhf.flipped ? rect_xywhf.h : rect_xywhf.w),
        ih = 0|(rect_xywhf.flipped ? rect_xywhf.w : rect_xywhf.h);

    if(this.rc.w() - iw > this.rc.h() - ih) {
      this.c0.Set(this.rc.l, this.rc.t, this.rc.l+iw, this.rc.b);
      this.c1.Set(this.rc.l+iw, this.rc.t, this.rc.r, this.rc.b);
    }
    else {
      this.c0.Set(this.rc.l, this.rc.t, this.rc.r, this.rc.t + ih);
      this.c1.Set(this.rc.l, this.rc.t + ih, this.rc.r, this.rc.b);
    }

    // console.log(this.c0.pn.rc, rect_xywhf);
    return this.c0.pn.insert(rect_xywhf);
  },


  delcheck : function(){
    if(this.c0.pn) { this.c0.fill = false; this.c0.pn.delcheck(); }
    if(this.c1.pn) { this.c1.fill = false; this.c1.pn.delcheck(); }
  }

};

function area(rect_xywhf_a, rect_xywhf_b) {
  return rect_xywhf_a.area() > rect_xywhf_b.area();
}

function perimeter(rect_xywhf_a, rect_xywhf_b) {
  return rect_xywhf_a.perimeter() > rect_xywhf_b.perimeter();
}

function max_side(rect_xywhf_a, rect_xywhf_b) {
  return Math.max(rect_xywhf_a.w, rect_xywhf_a.h) > Math.max(rect_xywhf_b.w, rect_xywhf_b.h);
}

function max_width(rect_xywhf_a, rect_xywhf_b) {
  return rect_xywhf_a.w > rect_xywhf_b.w;
}

function max_height(rect_xywhf_a, rect_xywhf_b) {
  return rect_xywhf_a.h > rect_xywhf_b.h;
}

let cmpf = [
  area,
  perimeter,
  max_side,
  max_width,
  max_height
];

let discard_step = 128;

function _rect2D( v /*rect_xywhf*/, max_s, succ, unsucc ){

  let root = new node( new rect_ltrb(0, 0, 0, 0) );

  let n     = v.length;
  let funcs = cmpf.length;

  let order = [];

  for(let f = 0; f < funcs; ++f) {
    let cpy = v.slice();
    cpy.sort( cmpf[f] );
    order.push( cpy );
  }

  let min_bin = new rect_wh(max_s, max_s);
  let min_func = -1, best_func = 0, best_area = 0, _area = 0, step, fit, i;

  let fail = false;

  for(let f = 0; f < funcs; ++f) {
    v = order[f];
    step = 0|(min_bin.w / 2 );
    root.reset(min_bin);

    while(true) {
      if(root.rc.w() > min_bin.w) {
        if(min_func > -1) break;
        _area = 0;

        root.reset(min_bin);
        for(i = 0; i < n; ++i)
          if(root.insert(v[i]) != null)
            _area += v[i].area();

        fail = true;
        break;
      }

      fit = -1;

      for(i = 0; i < n; ++i)
        if(root.insert(v[i]) === null) {
          fit = 1;
          break;
        }

        if(fit === -1 && step <= discard_step)
          break;

        root.reset( new rect_wh(root.rc.w() + fit*step, root.rc.h() + fit*step));

        step = 0|(step/2);
        if(!step)
          step = 1;
    }

    if(!fail && (min_bin.area() >= root.rc.area())) {
      min_bin = new rect_wh( root.rc.w(), root.rc.h() );
      min_func = f;
    }

    else if(fail && (_area > best_area)) {
      best_area = _area;
      best_func = f;
    }
    fail = false;
  }

  v = order[min_func == -1 ? best_func : min_func];

  let clip_x = 0, clip_y = 0;
  let ret;//node

  root.reset(min_bin);

  for(i = 0; i < n; ++i) {
    ret = root.insert(v[i]);
    if(ret != null) {
      v[i].x = ret.rc.l;
      v[i].y = ret.rc.t;

      if(v[i].flipped) {
        v[i].flipped = false;
        v[i].flip();
      }

      clip_x = Math.max(clip_x, ret.rc.r);
      clip_y = Math.max(clip_y, ret.rc.b);

      succ.push(v[i]);
    }
    else {
      unsucc.push(v[i]);

      v[i].flipped = false;
    }
  }

  return new rect_wh(clip_x, clip_y);
}

function pack(v /*rect_xywhf*/, max_s, bins) {
  let n     = v.length;
  let _rect = new rect_wh(max_s, max_s);

  let vec0 = [];
  let vec1 = [];

  for(let i = 0; i < n; ++i) {
    vec0.push(v[i].clone());
    if(!v[i].fits(_rect)) return false;
  }

  let b = null;// bin

  let ccc = 0
  while(true) {
    bins.push(new bin());

    b = bins[bins.length-1];

    b.size = _rect2D( vec0, max_s, b.rects, vec1 );
    vec0.length = 0;

    if( vec1.length === 0 ) break;

    let tmp = vec0;
    vec0 = vec1;
    vec1 = tmp;

    ccc++;
    if( ccc > 10 ) throw "overflow";

  }

  return true;
}

module.exports = {
    pack: pack,
    rect_xywhf: rect_xywhf
};
