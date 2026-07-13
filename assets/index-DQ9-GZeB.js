var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},c=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},l=(n,r,a)=>(a=n==null?{}:e(i(n)),c(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n));(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var u=1e3,d=1001,f=1002,p=1003,m=1004,h=1005,g=1006,_=1007,v=1008,y=1009,b=1010,x=1011,S=1012,C=1013,w=1014,T=1015,E=1016,D=1017,ee=1018,te=1020,O=35902,ne=35899,re=1021,k=1022,ie=1023,ae=1026,oe=1027,se=1028,ce=1029,le=1030,ue=1031,de=1033,fe=33776,pe=33777,A=33778,me=33779,he=35840,ge=35841,_e=35842,ve=35843,ye=36196,be=37492,xe=37496,Se=37488,Ce=37489,we=37490,Te=37491,Ee=37808,De=37809,Oe=37810,ke=37811,Ae=37812,je=37813,Me=37814,Ne=37815,Pe=37816,Fe=37817,Ie=37818,Le=37819,j=37820,Re=37821,ze=36492,Be=36494,M=36495,Ve=36283,N=36284,P=36285,He=36286,Ue=2300,We=2301,Ge=2302,Ke=2303,qe=2400,Je=2401,Ye=2402,Xe=3200,Ze=`srgb`,Qe=`srgb-linear`,$e=`linear`,et=`srgb`,tt=7680,nt=35044,rt=2e3;function it(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function at(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function ot(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}function st(){let e=ot(`canvas`);return e.style.display=`block`,e}var ct={};function lt(...e){let t=`THREE.`+e.shift();console.log(t,...e)}function ut(e){let t=e[0];if(typeof t==`string`&&t.startsWith(`TSL:`)){let t=e[1];t&&t.isStackTrace?e[0]+=` `+t.getLocation():e[1]=`Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.`}return e}function F(...e){e=ut(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function I(...e){e=ut(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function dt(...e){let t=e.join(` `);t in ct||(ct[t]=!0,F(...e))}function ft(e,t,n){return new Promise(function(r,i){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:i();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:r()}}setTimeout(a,n)})}var pt={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},mt=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let r=n[e];if(r!==void 0){let e=r.indexOf(t);e!==-1&&r.splice(e,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let t=n.slice(0);for(let n=0,r=t.length;n<r;n++)t[n].call(this,e);e.target=null}}},ht=`00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`),gt=1234567,_t=Math.PI/180,vt=180/Math.PI;function yt(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(ht[e&255]+ht[e>>8&255]+ht[e>>16&255]+ht[e>>24&255]+`-`+ht[t&255]+ht[t>>8&255]+`-`+ht[t>>16&15|64]+ht[t>>24&255]+`-`+ht[n&63|128]+ht[n>>8&255]+`-`+ht[n>>16&255]+ht[n>>24&255]+ht[r&255]+ht[r>>8&255]+ht[r>>16&255]+ht[r>>24&255]).toLowerCase()}function L(e,t,n){return Math.max(t,Math.min(n,e))}function bt(e,t){return(e%t+t)%t}function xt(e,t,n,r,i){return r+(e-t)*(i-r)/(n-t)}function St(e,t,n){return e===t?0:(n-e)/(t-e)}function Ct(e,t,n){return(1-n)*e+n*t}function wt(e,t,n,r){return Ct(e,t,1-Math.exp(-n*r))}function Tt(e,t=1){return t-Math.abs(bt(e,t*2)-t)}function Et(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*(3-2*e))}function Dt(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10))}function Ot(e,t){return e+Math.floor(Math.random()*(t-e+1))}function kt(e,t){return e+Math.random()*(t-e)}function At(e){return e*(.5-Math.random())}function jt(e){e!==void 0&&(gt=e);let t=gt+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Mt(e){return e*_t}function Nt(e){return e*vt}function Pt(e){return(e&e-1)==0&&e!==0}function Ft(e){return 2**Math.ceil(Math.log(e)/Math.LN2)}function It(e){return 2**Math.floor(Math.log(e)/Math.LN2)}function Lt(e,t,n,r,i){let a=Math.cos,o=Math.sin,s=a(n/2),c=o(n/2),l=a((t+r)/2),u=o((t+r)/2),d=a((t-r)/2),f=o((t-r)/2),p=a((r-t)/2),m=o((r-t)/2);switch(i){case`XYX`:e.set(s*u,c*d,c*f,s*l);break;case`YZY`:e.set(c*f,s*u,c*d,s*l);break;case`ZXZ`:e.set(c*d,c*f,s*u,s*l);break;case`XZX`:e.set(s*u,c*m,c*p,s*l);break;case`YXY`:e.set(c*p,s*u,c*m,s*l);break;case`ZYZ`:e.set(c*m,c*p,s*u,s*l);break;default:F(`MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: `+i)}}function Rt(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}function zt(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}var Bt={DEG2RAD:_t,RAD2DEG:vt,generateUUID:yt,clamp:L,euclideanModulo:bt,mapLinear:xt,inverseLerp:St,lerp:Ct,damp:wt,pingpong:Tt,smoothstep:Et,smootherstep:Dt,randInt:Ot,randFloat:kt,randFloatSpread:At,seededRandom:jt,degToRad:Mt,radToDeg:Nt,isPowerOfTwo:Pt,ceilPowerOfTwo:Ft,floorPowerOfTwo:It,setQuaternionFromProperEuler:Lt,normalize:zt,denormalize:Rt},R=class e{static{e.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`THREE.Vector2: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`THREE.Vector2: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=L(this.x,e.x,t.x),this.y=L(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=L(this.x,e,t),this.y=L(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(L(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(L(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Vt=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(u!==m||s!==d||c!==f||l!==p){let e=s*d+c*f+l*p+u*m;e<0&&(d=-d,f=-f,p=-p,m=-m,e=-e);let t=1-o;if(e<.9995){let n=Math.acos(e),r=Math.sin(n);t=Math.sin(t*n)/r,o=Math.sin(o*n)/r,s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o}else{s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o;let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:F(`Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(L(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,i=-i,a=-a,o=-o);let s=1-t;if(o<.9995){let e=Math.acos(o),c=Math.sin(e);s=Math.sin(s*e)/c,t=Math.sin(t*e)/c,this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this._onChangeCallback()}else this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},z=class e{static{e.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`THREE.Vector3: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`THREE.Vector3: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Ut.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Ut.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=L(this.x,e.x,t.x),this.y=L(this.y,e.y,t.y),this.z=L(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=L(this.x,e,t),this.y=L(this.y,e,t),this.z=L(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(L(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Ht.copy(this).projectOnVector(e),this.sub(Ht)}reflect(e){return this.sub(Ht.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(L(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Ht=new z,Ut=new Vt,B=class e{static{e.prototype.isMatrix3=!0}constructor(e,t,n,r,i,a,o,s,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return dt(`Matrix3: .scale() is deprecated. Use .makeScale() instead.`),this.premultiply(Wt.makeScale(e,t)),this}rotate(e){return dt(`Matrix3: .rotate() is deprecated. Use .makeRotation() instead.`),this.premultiply(Wt.makeRotation(-e)),this}translate(e,t){return dt(`Matrix3: .translate() is deprecated. Use .makeTranslation() instead.`),this.premultiply(Wt.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Wt=new B,Gt=new B().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Kt=new B().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function qt(){let e={enabled:!0,workingColorSpace:Qe,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n?e:(this.spaces[t].transfer===`srgb`&&(e.r=Jt(e.r),e.g=Jt(e.g),e.b=Jt(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=Yt(e.r),e.g=Yt(e.g),e.b=Yt(e.b)),e)},workingToColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},colorSpaceToWorking:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?$e:this.spaces[e].transfer},getToneMappingMode:function(e){return this.spaces[e].outputColorSpaceConfig.toneMappingMode||`standard`},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(t,n){return dt(`ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().`),e.workingToColorSpace(t,n)},toWorkingColorSpace:function(t,n){return dt(`ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().`),e.colorSpaceToWorking(t,n)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[Qe]:{primaries:t,whitePoint:r,transfer:$e,toXYZ:Gt,fromXYZ:Kt,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:Ze},outputColorSpaceConfig:{drawingBufferColorSpace:Ze}},[Ze]:{primaries:t,whitePoint:r,transfer:et,toXYZ:Gt,fromXYZ:Kt,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:Ze}}}),e}var V=qt();function Jt(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function Yt(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}var Xt,Zt=class{static getDataURL(e,t=`image/png`){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Xt===void 0&&(Xt=ot(`canvas`)),Xt.width=e.width,Xt.height=e.height;let t=Xt.getContext(`2d`);e instanceof ImageData?t.putImageData(e,0,0):t.drawImage(e,0,0,e.width,e.height),n=Xt}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=ot(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=Jt(i[e]/255)*255;return n.putImageData(r,0,0),t}else if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(Jt(t[e]/255)*255):t[e]=Jt(t[e]);return{data:t,width:e.width,height:e.height}}else return F(`ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}},Qt=0,$t=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Qt++}),this.uuid=yt(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<`u`&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<`u`&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(en(r[t].image)):e.push(en(r[t]))}else e=en(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function en(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?Zt.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(F(`Texture: Unable to serialize Texture.`),{})}var tn=0,nn=new z,rn=class e extends mt{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,r=d,i=d,a=g,o=v,s=ie,c=y,l=e.DEFAULT_ANISOTROPY,u=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:tn++}),this.uuid=yt(),this.name=``,this.source=new $t(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=r,this.wrapT=i,this.magFilter=a,this.minFilter=o,this.anisotropy=l,this.format=s,this.internalFormat=null,this.type=c,this.offset=new R(0,0),this.repeat=new R(1,1),this.center=new R(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new B,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(nn).x}get height(){return this.source.getSize(nn).y}get depth(){return this.source.getSize(nn).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){F(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){F(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case u:e.x-=Math.floor(e.x);break;case d:e.x=e.x<0?0:1;break;case f:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x-=Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case u:e.y-=Math.floor(e.y);break;case d:e.y=e.y<0?0:1;break;case f:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y-=Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};rn.DEFAULT_IMAGE=null,rn.DEFAULT_MAPPING=300,rn.DEFAULT_ANISOTROPY=1;var an=class e{static{e.prototype.isVector4=!0}constructor(e=0,t=0,n=0,r=1){this.x=e,this.y=t,this.z=n,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`THREE.Vector4: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`THREE.Vector4: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=L(this.x,e.x,t.x),this.y=L(this.y,e.y,t.y),this.z=L(this.z,e.z,t.z),this.w=L(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=L(this.x,e,t),this.y=L(this.y,e,t),this.z=L(this.z,e,t),this.w=L(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(L(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},on=class extends mt{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:g,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new an(0,0,e,t),this.scissorTest=!1,this.viewport=new an(0,0,e,t),this.textures=[];let r=new rn({width:e,height:t,depth:n.depth}),i=n.count;for(let e=0;e<i;e++)this.textures[e]=r.clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:g,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let e=0;e<this.textures.length;e++)this.textures[e].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.textures.length;r<i;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let n=Object.assign({},e.textures[t].image);this.textures[t].source=new $t(n)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:`dispose`})}},sn=class extends on{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},cn=class extends rn{constructor(e=null,t=1,n=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=p,this.minFilter=p,this.wrapR=d,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},ln=class extends rn{constructor(e=null,t=1,n=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=p,this.minFilter=p,this.wrapR=d,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},un=class e{static{e.prototype.isMatrix4=!0}constructor(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,r=1/dn.setFromMatrixColumn(e,0).length(),i=1/dn.setFromMatrixColumn(e,1).length(),a=1/dn.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(pn,e,mn)}lookAt(e,t,n){let r=this.elements;return _n.subVectors(e,t),_n.lengthSq()===0&&(_n.z=1),_n.normalize(),hn.crossVectors(n,_n),hn.lengthSq()===0&&(Math.abs(n.z)===1?_n.x+=1e-4:_n.z+=1e-4,_n.normalize(),hn.crossVectors(n,_n)),hn.normalize(),gn.crossVectors(_n,hn),r[0]=hn.x,r[4]=gn.x,r[8]=_n.x,r[1]=hn.y,r[5]=gn.y,r[9]=_n.y,r[2]=hn.z,r[6]=gn.z,r[10]=_n.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],ee=r[13],te=r[2],O=r[6],ne=r[10],re=r[14],k=r[3],ie=r[7],ae=r[11],oe=r[15];return i[0]=a*x+o*T+s*te+c*k,i[4]=a*S+o*E+s*O+c*ie,i[8]=a*C+o*D+s*ne+c*ae,i[12]=a*w+o*ee+s*re+c*oe,i[1]=l*x+u*T+d*te+f*k,i[5]=l*S+u*E+d*O+f*ie,i[9]=l*C+u*D+d*ne+f*ae,i[13]=l*w+u*ee+d*re+f*oe,i[2]=p*x+m*T+h*te+g*k,i[6]=p*S+m*E+h*O+g*ie,i[10]=p*C+m*D+h*ne+g*ae,i[14]=p*w+m*ee+h*re+g*oe,i[3]=_*x+v*T+y*te+b*k,i[7]=_*S+v*E+y*O+b*ie,i[11]=_*C+v*D+y*ne+b*ae,i[15]=_*w+v*ee+y*re+b*oe,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15],_=s*f-c*d,v=o*f-c*u,y=o*d-s*u,b=a*f-c*l,x=a*d-s*l,S=a*u-o*l;return t*(m*_-h*v+g*y)-n*(p*_-h*b+g*x)+r*(p*v-m*b+g*S)-i*(p*y-m*x+h*S)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[1],a=e[5],o=e[9],s=e[2],c=e[6],l=e[10];return t*(a*l-o*c)-n*(i*l-o*s)+r*(i*c-a*s)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,ee=d*g-f*h,te=_*ee-v*D+y*E+b*T-x*w+S*C;if(te===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let O=1/te;return e[0]=(o*ee-s*D+c*E)*O,e[1]=(r*D-n*ee-i*E)*O,e[2]=(m*S-h*x+g*b)*O,e[3]=(d*x-u*S-f*b)*O,e[4]=(s*T-a*ee-c*w)*O,e[5]=(t*ee-r*T+i*w)*O,e[6]=(h*y-p*S-g*v)*O,e[7]=(l*S-d*y+f*v)*O,e[8]=(a*D-o*T+c*C)*O,e[9]=(n*T-t*D-i*C)*O,e[10]=(p*x-m*y+g*_)*O,e[11]=(u*y-l*x-f*_)*O,e[12]=(o*w-a*E-s*C)*O,e[13]=(t*E-n*w+r*C)*O,e[14]=(m*v-p*b-h*_)*O,e[15]=(l*b-u*v+d*_)*O,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let i=this.determinantAffine();if(i===0)return n.set(1,1,1),t.identity(),this;let a=dn.set(r[0],r[1],r[2]).length(),o=dn.set(r[4],r[5],r[6]).length(),s=dn.set(r[8],r[9],r[10]).length();i<0&&(a=-a),fn.copy(this);let c=1/a,l=1/o,u=1/s;return fn.elements[0]*=c,fn.elements[1]*=c,fn.elements[2]*=c,fn.elements[4]*=l,fn.elements[5]*=l,fn.elements[6]*=l,fn.elements[8]*=u,fn.elements[9]*=u,fn.elements[10]*=u,t.setFromRotationMatrix(fn),n.x=a,n.y=o,n.z=s,this}makePerspective(e,t,n,r,i,a,o=rt,s=!1){let c=this.elements,l=2*i/(t-e),u=2*i/(n-r),d=(t+e)/(t-e),f=(n+r)/(n-r),p,m;if(s)p=i/(a-i),m=a*i/(a-i);else if(o===2e3)p=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)p=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=rt,s=!1){let c=this.elements,l=2/(t-e),u=2/(n-r),d=-(t+e)/(t-e),f=-(n+r)/(n-r),p,m;if(s)p=1/(a-i),m=a/(a-i);else if(o===2e3)p=-2/(a-i),m=-(a+i)/(a-i);else if(o===2001)p=-1/(a-i),m=-i/(a-i);else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},dn=new z,fn=new un,pn=new z(0,0,0),mn=new z(1,1,1),hn=new z,gn=new z,_n=new z,vn=new un,yn=new Vt,bn=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(L(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-L(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(L(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-L(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(L(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-L(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:F(`Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return vn.makeRotationFromQuaternion(e),this.setFromRotationMatrix(vn,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return yn.setFromEuler(this),this.setFromQuaternion(yn,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};bn.DEFAULT_ORDER=`XYZ`;var xn=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!=0}},Sn=0,Cn=new z,wn=new Vt,Tn=new un,En=new z,Dn=new z,On=new z,kn=new Vt,An=new z(1,0,0),jn=new z(0,1,0),Mn=new z(0,0,1),Nn={type:`added`},Pn={type:`removed`},Fn={type:`childadded`,child:null},In={type:`childremoved`,child:null},Ln=class e extends mt{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Sn++}),this.uuid=yt(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new z,n=new bn,r=new Vt,i=new z(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new un},normalMatrix:{value:new B}}),this.matrix=new un,this.matrixWorld=new un,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new xn,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return wn.setFromAxisAngle(e,t),this.quaternion.multiply(wn),this}rotateOnWorldAxis(e,t){return wn.setFromAxisAngle(e,t),this.quaternion.premultiply(wn),this}rotateX(e){return this.rotateOnAxis(An,e)}rotateY(e){return this.rotateOnAxis(jn,e)}rotateZ(e){return this.rotateOnAxis(Mn,e)}translateOnAxis(e,t){return Cn.copy(e).applyQuaternion(this.quaternion),this.position.add(Cn.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(An,e)}translateY(e){return this.translateOnAxis(jn,e)}translateZ(e){return this.translateOnAxis(Mn,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Tn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?En.copy(e):En.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),Dn.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Tn.lookAt(Dn,En,this.up):Tn.lookAt(En,Dn,this.up),this.quaternion.setFromRotationMatrix(Tn),r&&(Tn.extractRotation(r.matrixWorld),wn.setFromRotationMatrix(Tn),this.quaternion.premultiply(wn.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(I(`Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Nn),Fn.child=e,this.dispatchEvent(Fn),Fn.child=null):I(`Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Pn),In.child=e,this.dispatchEvent(In),In.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Tn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Tn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Tn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Nn),Fn.child=e,this.dispatchEvent(Fn),Fn.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Dn,e,On),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Dn,kn,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,r=e.z,i=this.matrix.elements;i[12]+=t-i[0]*t-i[4]*n-i[8]*r,i[13]+=n-i[1]*t-i[5]*n-i[9]*r,i[14]+=r-i[2]*t-i[6]*n-i[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){let e=this.children;for(let t=0,r=e.length;t<r;t++)e[t].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==``&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),this.static!==!1&&(r.static=this.static),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox?e.boundingBox.toJSON():void 0,boundingSphere:e.boundingSphere?e.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(e=>({...e})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material);if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot===null?null:e.pivot.clone(),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}};Ln.DEFAULT_UP=new z(0,1,0),Ln.DEFAULT_MATRIX_AUTO_UPDATE=!0,Ln.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Rn=class extends Ln{constructor(){super(),this.isGroup=!0,this.type=`Group`}},zn={type:`move`},Bn=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Rn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Rn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new z,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new z),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Rn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new z,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new z,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:`connected`,data:e}),this}disconnect(e){return this.dispatchEvent({type:`disconnected`,data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,i=null,a=null,o=this._targetRay,s=this._grip,c=this._hand;if(e&&t.session.visibilityState!==`visible-blurred`){if(c&&e.hand){a=!0;for(let r of e.hand.values()){let e=t.getJointPose(r,n),i=this._getHandJoint(c,r);e!==null&&(i.matrix.fromArray(e.transform.matrix),i.matrix.decompose(i.position,i.rotation,i.scale),i.matrixWorldNeedsUpdate=!0,i.jointRadius=e.radius),i.visible=e!==null}let r=c.joints[`index-finger-tip`],i=c.joints[`thumb-tip`],o=r.position.distanceTo(i.position);c.inputState.pinching&&o>.025?(c.inputState.pinching=!1,this.dispatchEvent({type:`pinchend`,handedness:e.handedness,target:this})):!c.inputState.pinching&&o<=.015&&(c.inputState.pinching=!0,this.dispatchEvent({type:`pinchstart`,handedness:e.handedness,target:this}))}else s!==null&&e.gripSpace&&(i=t.getPose(e.gripSpace,n),i!==null&&(s.matrix.fromArray(i.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,i.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(i.linearVelocity)):s.hasLinearVelocity=!1,i.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(i.angularVelocity)):s.hasAngularVelocity=!1,s.eventsEnabled&&s.dispatchEvent({type:`gripUpdated`,data:e,target:this})));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&i!==null&&(r=i),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(zn)))}return o!==null&&(o.visible=r!==null),s!==null&&(s.visible=i!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Rn;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Vn={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Hn={h:0,s:0,l:0},Un={h:0,s:0,l:0};function Wn(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var H=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Ze){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,V.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=V.workingColorSpace){return this.r=e,this.g=t,this.b=n,V.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=V.workingColorSpace){if(e=bt(e,1),t=L(t,0,1),n=L(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=Wn(i,r,e+1/3),this.g=Wn(i,r,e),this.b=Wn(i,r,e-1/3)}return V.colorSpaceToWorking(this,r),this}setStyle(e,t=Ze){function n(t){t!==void 0&&parseFloat(t)<1&&F(`Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:F(`Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);F(`Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Ze){let n=Vn[e.toLowerCase()];return n===void 0?F(`Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Jt(e.r),this.g=Jt(e.g),this.b=Jt(e.b),this}copyLinearToSRGB(e){return this.r=Yt(e.r),this.g=Yt(e.g),this.b=Yt(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Ze){return V.workingToColorSpace(Gn.copy(this),e),Math.round(L(Gn.r*255,0,255))*65536+Math.round(L(Gn.g*255,0,255))*256+Math.round(L(Gn.b*255,0,255))}getHexString(e=Ze){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=V.workingColorSpace){V.workingToColorSpace(Gn.copy(this),t);let n=Gn.r,r=Gn.g,i=Gn.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4;break}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=V.workingColorSpace){return V.workingToColorSpace(Gn.copy(this),t),e.r=Gn.r,e.g=Gn.g,e.b=Gn.b,e}getStyle(e=Ze){V.workingToColorSpace(Gn.copy(this),e);let t=Gn.r,n=Gn.g,r=Gn.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(Hn),this.setHSL(Hn.h+e,Hn.s+t,Hn.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Hn),e.getHSL(Un);let n=Ct(Hn.h,Un.h,t),r=Ct(Hn.s,Un.s,t),i=Ct(Hn.l,Un.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Gn=new H;H.NAMES=Vn;var Kn=class e{constructor(e,t=1,n=1e3){this.isFog=!0,this.name=``,this.color=new H(e),this.near=t,this.far=n}clone(){return new e(this.color,this.near,this.far)}toJSON(){return{type:`Fog`,name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},qn=class extends Ln{constructor(){super(),this.isScene=!0,this.type=`Scene`,this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new bn,this.environmentIntensity=1,this.environmentRotation=new bn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},Jn=new z,Yn=new z,Xn=new z,Zn=new z,Qn=new z,$n=new z,er=new z,tr=new z,nr=new z,rr=new z,ir=new an,ar=new an,or=new an,sr=class e{constructor(e=new z,t=new z,n=new z){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),Jn.subVectors(e,t),r.cross(Jn);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){Jn.subVectors(r,t),Yn.subVectors(n,t),Xn.subVectors(e,t);let a=Jn.dot(Jn),o=Jn.dot(Yn),s=Jn.dot(Xn),c=Yn.dot(Yn),l=Yn.dot(Xn),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,Zn)===null?!1:Zn.x>=0&&Zn.y>=0&&Zn.x+Zn.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,Zn)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,Zn.x),s.addScaledVector(a,Zn.y),s.addScaledVector(o,Zn.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return ir.setScalar(0),ar.setScalar(0),or.setScalar(0),ir.fromBufferAttribute(e,t),ar.fromBufferAttribute(e,n),or.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(ir,i.x),a.addScaledVector(ar,i.y),a.addScaledVector(or,i.z),a}static isFrontFacing(e,t,n,r){return Jn.subVectors(n,t),Yn.subVectors(e,t),Jn.cross(Yn).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Jn.subVectors(this.c,this.b),Yn.subVectors(this.a,this.b),Jn.cross(Yn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;Qn.subVectors(r,n),$n.subVectors(i,n),tr.subVectors(e,n);let s=Qn.dot(tr),c=$n.dot(tr);if(s<=0&&c<=0)return t.copy(n);nr.subVectors(e,r);let l=Qn.dot(nr),u=$n.dot(nr);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(Qn,a);rr.subVectors(e,i);let f=Qn.dot(rr),p=$n.dot(rr);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector($n,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return er.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(er,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(Qn,a).addScaledVector($n,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},cr=class{constructor(e=new z(1/0,1/0,1/0),t=new z(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(ur.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(ur.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=ur.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,ur):ur.fromBufferAttribute(r,t),ur.applyMatrix4(e.matrixWorld),this.expandByPoint(ur);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),dr.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),dr.copy(e.boundingBox)),dr.applyMatrix4(e.matrixWorld),this.union(dr)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,ur),ur.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(vr),yr.subVectors(this.max,vr),fr.subVectors(e.a,vr),pr.subVectors(e.b,vr),mr.subVectors(e.c,vr),hr.subVectors(pr,fr),gr.subVectors(mr,pr),_r.subVectors(fr,mr);let t=[0,-hr.z,hr.y,0,-gr.z,gr.y,0,-_r.z,_r.y,hr.z,0,-hr.x,gr.z,0,-gr.x,_r.z,0,-_r.x,-hr.y,hr.x,0,-gr.y,gr.x,0,-_r.y,_r.x,0];return!Sr(t,fr,pr,mr,yr)||(t=[1,0,0,0,1,0,0,0,1],!Sr(t,fr,pr,mr,yr))?!1:(br.crossVectors(hr,gr),t=[br.x,br.y,br.z],Sr(t,fr,pr,mr,yr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,ur).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(ur).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(lr[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),lr[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),lr[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),lr[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),lr[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),lr[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),lr[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),lr[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(lr),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},lr=[new z,new z,new z,new z,new z,new z,new z,new z],ur=new z,dr=new cr,fr=new z,pr=new z,mr=new z,hr=new z,gr=new z,_r=new z,vr=new z,yr=new z,br=new z,xr=new z;function Sr(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){xr.fromArray(e,a);let o=i.x*Math.abs(xr.x)+i.y*Math.abs(xr.y)+i.z*Math.abs(xr.z),s=t.dot(xr),c=n.dot(xr),l=r.dot(xr);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}var Cr=new z,wr=new R,Tr=0,Er=class extends mt{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Tr++}),this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=nt,this.updateRanges=[],this.gpuType=T,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)wr.fromBufferAttribute(this,t),wr.applyMatrix3(e),this.setXY(t,wr.x,wr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Cr.fromBufferAttribute(this,t),Cr.applyMatrix3(e),this.setXYZ(t,Cr.x,Cr.y,Cr.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Cr.fromBufferAttribute(this,t),Cr.applyMatrix4(e),this.setXYZ(t,Cr.x,Cr.y,Cr.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Cr.fromBufferAttribute(this,t),Cr.applyNormalMatrix(e),this.setXYZ(t,Cr.x,Cr.y,Cr.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Cr.fromBufferAttribute(this,t),Cr.transformDirection(e),this.setXYZ(t,Cr.x,Cr.y,Cr.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Rt(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=zt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Rt(t,this.array)),t}setX(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Rt(t,this.array)),t}setY(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Rt(t,this.array)),t}setZ(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Rt(t,this.array)),t}setW(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),r=zt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),r=zt(r,this.array),i=zt(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==``&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}dispose(){this.dispatchEvent({type:`dispose`})}},Dr=class extends Er{constructor(e,t,n){super(new Uint16Array(e),t,n)}},Or=class extends Er{constructor(e,t,n){super(new Uint32Array(e),t,n)}},kr=class extends Er{constructor(e,t,n){super(new Float32Array(e),t,n)}},Ar=new cr,jr=new z,Mr=new z,Nr=class{constructor(e=new z,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?Ar.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;jr.subVectors(e,this.center);let t=jr.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(jr,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Mr.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(jr.copy(e.center).add(Mr)),this.expandByPoint(jr.copy(e.center).sub(Mr))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Pr=0,Fr=new un,Ir=new Ln,Lr=new z,Rr=new cr,zr=new cr,Br=new z,Vr=class e extends mt{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Pr++}),this.uuid=yt(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(it(e)?Or:Dr)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new B().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return Fr.makeRotationFromQuaternion(e),this.applyMatrix4(Fr),this}rotateX(e){return Fr.makeRotationX(e),this.applyMatrix4(Fr),this}rotateY(e){return Fr.makeRotationY(e),this.applyMatrix4(Fr),this}rotateZ(e){return Fr.makeRotationZ(e),this.applyMatrix4(Fr),this}translate(e,t,n){return Fr.makeTranslation(e,t,n),this.applyMatrix4(Fr),this}scale(e,t,n){return Fr.makeScale(e,t,n),this.applyMatrix4(Fr),this}lookAt(e){return Ir.lookAt(e),Ir.updateMatrix(),this.applyMatrix4(Ir.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Lr).negate(),this.translate(Lr.x,Lr.y,Lr.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new kr(t,3))}else{let n=Math.min(e.length,t.count);for(let r=0;r<n;r++){let n=e[r];t.setXYZ(r,n.x,n.y,n.z||0)}e.length>t.count&&F(`BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new cr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){I(`BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new z(-1/0,-1/0,-1/0),new z(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Rr.setFromBufferAttribute(n),this.morphTargetsRelative?(Br.addVectors(this.boundingBox.min,Rr.min),this.boundingBox.expandByPoint(Br),Br.addVectors(this.boundingBox.max,Rr.max),this.boundingBox.expandByPoint(Br)):(this.boundingBox.expandByPoint(Rr.min),this.boundingBox.expandByPoint(Rr.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&I(`BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Nr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){I(`BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new z,1/0);return}if(e){let n=this.boundingSphere.center;if(Rr.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];zr.setFromBufferAttribute(n),this.morphTargetsRelative?(Br.addVectors(Rr.min,zr.min),Rr.expandByPoint(Br),Br.addVectors(Rr.max,zr.max),Rr.expandByPoint(Br)):(Rr.expandByPoint(zr.min),Rr.expandByPoint(zr.max))}Rr.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)Br.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(Br));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)Br.fromBufferAttribute(a,t),o&&(Lr.fromBufferAttribute(e,t),Br.add(Lr)),r=Math.max(r,n.distanceToSquared(Br))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&I(`BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){I(`BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv,a=this.getAttribute(`tangent`);(a===void 0||a.count!==n.count)&&(a=new Er(new Float32Array(4*n.count),4),this.setAttribute(`tangent`,a));let o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new z,s[e]=new z;let c=new z,l=new z,u=new z,d=new R,f=new R,p=new R,m=new z,h=new z;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new z,y=new z,b=new z,x=new z;function S(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)S(e.getX(t+0)),S(e.getX(t+1)),S(e.getX(t+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0||n.count!==t.count)n=new Er(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new z,i=new z,a=new z,o=new z,s=new z,c=new z,l=new z,u=new z;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Br.fromBufferAttribute(e,t),Br.normalize(),e.setXYZ(t,Br.x,Br.y,Br.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new Er(a,r,i)}if(this.index===null)return F(`BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.7,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?`BufferGeometry`:this.type,this.name!==``&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:`dispose`})}},Hr=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e===void 0?0:e.length/t,this.usage=nt,this.updateRanges=[],this.version=0,this.uuid=yt()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let r=0,i=this.stride;r<i;r++)this.array[e+r]=t.array[n+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=yt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=yt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},Ur=new z,Wr=class e{constructor(e,t,n,r=!1){this.isInterleavedBufferAttribute=!0,this.name=``,this.data=e,this.itemSize=t,this.offset=n,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Ur.fromBufferAttribute(this,t),Ur.applyMatrix4(e),this.setXYZ(t,Ur.x,Ur.y,Ur.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ur.fromBufferAttribute(this,t),Ur.applyNormalMatrix(e),this.setXYZ(t,Ur.x,Ur.y,Ur.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ur.fromBufferAttribute(this,t),Ur.transformDirection(e),this.setXYZ(t,Ur.x,Ur.y,Ur.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Rt(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=zt(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=zt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=zt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=zt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=zt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Rt(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Rt(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Rt(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Rt(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),r=zt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),r=zt(r,this.array),i=zt(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this.data.array[e+3]=i,this}clone(t){if(t===void 0){lt(`InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return new Er(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new e(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){lt(`InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Gr=0,Kr=class extends mt{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Gr++}),this.uuid=yt(),this.name=``,this.type=`Material`,this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new H(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=tt,this.stencilZFail=tt,this.stencilZPass=tt,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){F(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){F(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(n):r&&r.isVector2&&n&&n.isVector2||r&&r.isEuler&&n&&n.isEuler||r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:`Material`,generator:`Material.toJSON`}};n.uuid=this.uuid,n.type=this.type,this.name!==``&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==0&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==100&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==7680&&(n.stencilFail=this.stencilFail),this.stencilZFail!==7680&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==7680&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==`round`&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==`round`&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}if(t){let t=r(e.textures),i=r(e.images);t.length>0&&(n.textures=t),i.length>0&&(n.images=i)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new H().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors==`number`?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let t=e.normalScale;Array.isArray(t)===!1&&(t=[t,t]),this.normalScale=new R().fromArray(t)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new R().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let e=t.length;n=Array(e);for(let r=0;r!==e;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:`dispose`})}set needsUpdate(e){e===!0&&this.version++}},qr=class extends Kr{constructor(e){super(),this.isSpriteMaterial=!0,this.type=`SpriteMaterial`,this.color=new H(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},Jr,Yr=new z,Xr=new z,Zr=new z,Qr=new R,$r=new R,ei=new un,ti=new z,ni=new z,ri=new z,ii=new R,ai=new R,oi=new R,si=class extends Ln{constructor(e=new qr){if(super(),this.isSprite=!0,this.type=`Sprite`,Jr===void 0){Jr=new Vr;let e=new Hr(new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),5);Jr.setIndex([0,1,2,0,2,3]),Jr.setAttribute(`position`,new Wr(e,3,0,!1)),Jr.setAttribute(`uv`,new Wr(e,2,3,!1))}this.geometry=Jr,this.material=e,this.center=new R(.5,.5),this.count=1}raycast(e,t){e.camera===null&&I(`Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.`),Xr.setFromMatrixScale(this.matrixWorld),ei.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Zr.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Xr.multiplyScalar(-Zr.z);let n=this.material.rotation,r,i;n!==0&&(i=Math.cos(n),r=Math.sin(n));let a=this.center;ci(ti.set(-.5,-.5,0),Zr,a,Xr,r,i),ci(ni.set(.5,-.5,0),Zr,a,Xr,r,i),ci(ri.set(.5,.5,0),Zr,a,Xr,r,i),ii.set(0,0),ai.set(1,0),oi.set(1,1);let o=e.ray.intersectTriangle(ti,ni,ri,!1,Yr);if(o===null&&(ci(ni.set(-.5,.5,0),Zr,a,Xr,r,i),ai.set(0,1),o=e.ray.intersectTriangle(ti,ri,ni,!1,Yr),o===null))return;let s=e.ray.origin.distanceTo(Yr);s<e.near||s>e.far||t.push({distance:s,point:Yr.clone(),uv:sr.getInterpolation(Yr,ti,ni,ri,ii,ai,oi,new R),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function ci(e,t,n,r,i,a){Qr.subVectors(e,n).addScalar(.5).multiply(r),i===void 0?$r.copy(Qr):($r.x=a*Qr.x-i*Qr.y,$r.y=i*Qr.x+a*Qr.y),e.copy(t),e.x+=$r.x,e.y+=$r.y,e.applyMatrix4(ei)}var li=new z,ui=new z,di=new z,fi=new z,pi=new z,mi=new z,hi=new z,gi=class{constructor(e=new z,t=new z(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,li)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=li.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(li.copy(this.origin).addScaledVector(this.direction,t),li.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){ui.copy(e).add(t).multiplyScalar(.5),di.copy(t).sub(e).normalize(),fi.copy(this.origin).sub(ui);let i=e.distanceTo(t)*.5,a=-this.direction.dot(di),o=fi.dot(this.direction),s=-fi.dot(di),c=fi.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0)if(u=a*s-o,d=a*o-s,p=i*l,u>=0)if(d>=-p)if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c);else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(ui).addScaledVector(di,d),f}intersectSphere(e,t){li.subVectors(e.center,this.origin);let n=li.dot(this.direction),r=li.dot(li)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,li)!==null}intersectTriangle(e,t,n,r,i){pi.subVectors(t,e),mi.subVectors(n,e),hi.crossVectors(pi,mi);let a=this.direction.dot(hi),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;fi.subVectors(this.origin,e);let s=o*this.direction.dot(mi.crossVectors(fi,mi));if(s<0)return null;let c=o*this.direction.dot(pi.cross(fi));if(c<0||s+c>a)return null;let l=-o*fi.dot(hi);return l<0?null:this.at(l/a,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},_i=class extends Kr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type=`MeshBasicMaterial`,this.color=new H(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new bn,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},vi=new un,yi=new gi,bi=new Nr,xi=new z,Si=new z,Ci=new z,wi=new z,Ti=new z,Ei=new z,Di=new z,Oi=new z,U=class extends Ln{constructor(e=new Vr,t=new _i){super(),this.isMesh=!0,this.type=`Mesh`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}getVertexPosition(e,t){let n=this.geometry,r=n.attributes.position,i=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(i&&o){Ei.set(0,0,0);for(let n=0,r=i.length;n<r;n++){let r=o[n],s=i[n];r!==0&&(Ti.fromBufferAttribute(s,e),a?Ei.addScaledVector(Ti,r):Ei.addScaledVector(Ti.sub(t),r))}t.add(Ei)}return t}raycast(e,t){let n=this.geometry,r=this.material,i=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),bi.copy(n.boundingSphere),bi.applyMatrix4(i),yi.copy(e.ray).recast(e.near),!(bi.containsPoint(yi.origin)===!1&&(yi.intersectSphere(bi,xi)===null||yi.origin.distanceToSquared(xi)>(e.far-e.near)**2))&&(vi.copy(i).invert(),yi.copy(e.ray).applyMatrix4(vi),!(n.boundingBox!==null&&yi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,yi)))}_computeIntersections(e,t,n){let r,i=this.geometry,a=this.material,o=i.index,s=i.attributes.position,c=i.attributes.uv,l=i.attributes.uv1,u=i.attributes.normal,d=i.groups,f=i.drawRange;if(o!==null)if(Array.isArray(a))for(let i=0,s=d.length;i<s;i++){let s=d[i],p=a[s.materialIndex],m=Math.max(s.start,f.start),h=Math.min(o.count,Math.min(s.start+s.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=o.getX(i),d=o.getX(i+1),f=o.getX(i+2);r=Ai(this,p,e,n,c,l,u,a,d,f),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=s.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),s=Math.min(o.count,f.start+f.count);for(let d=i,f=s;d<f;d+=3){let i=o.getX(d),s=o.getX(d+1),f=o.getX(d+2);r=Ai(this,a,e,n,c,l,u,i,s,f),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}else if(s!==void 0)if(Array.isArray(a))for(let i=0,o=d.length;i<o;i++){let o=d[i],p=a[o.materialIndex],m=Math.max(o.start,f.start),h=Math.min(s.count,Math.min(o.start+o.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=i,s=i+1,d=i+2;r=Ai(this,p,e,n,c,l,u,a,s,d),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=o.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),o=Math.min(s.count,f.start+f.count);for(let s=i,d=o;s<d;s+=3){let i=s,o=s+1,d=s+2;r=Ai(this,a,e,n,c,l,u,i,o,d),r&&(r.faceIndex=Math.floor(s/3),t.push(r))}}}};function ki(e,t,n,r,i,a,o,s){let c;if(c=t.side===1?r.intersectTriangle(o,a,i,!0,s):r.intersectTriangle(i,a,o,t.side===0,s),c===null)return null;Oi.copy(s),Oi.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(Oi);return l<n.near||l>n.far?null:{distance:l,point:Oi.clone(),object:e}}function Ai(e,t,n,r,i,a,o,s,c,l){e.getVertexPosition(s,Si),e.getVertexPosition(c,Ci),e.getVertexPosition(l,wi);let u=ki(e,t,n,r,Si,Ci,wi,Di);if(u){let e=new z;sr.getBarycoord(Di,Si,Ci,wi,e),i&&(u.uv=sr.getInterpolatedAttribute(i,s,c,l,e,new R)),a&&(u.uv1=sr.getInterpolatedAttribute(a,s,c,l,e,new R)),o&&(u.normal=sr.getInterpolatedAttribute(o,s,c,l,e,new z),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let t={a:s,b:c,c:l,normal:new z,materialIndex:0};sr.getNormal(Si,Ci,wi,t.normal),u.face=t,u.barycoord=e}return u}var ji=class extends rn{constructor(e=null,t=1,n=1,r,i,a,o,s,c=p,l=p,u,d){super(null,a,o,s,c,l,r,i,u,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Mi=class extends Er{constructor(e,t,n,r=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},Ni=new un,Pi=new un,Fi=[],Ii=new cr,Li=new un,Ri=new U,zi=new Nr,Bi=class extends U{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new Mi(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let e=0;e<n;e++)this.setMatrixAt(e,Li)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new cr),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Ni),Ii.copy(e.boundingBox).applyMatrix4(Ni),this.boundingBox.union(Ii)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Nr),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Ni),zi.copy(e.boundingSphere).applyMatrix4(Ni),this.boundingSphere.union(zi)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,r=this.morphTexture.source.data.data,i=e*(n.length+1)+1;for(let e=0;e<n.length;e++)n[e]=r[i+e]}raycast(e,t){let n=this.matrixWorld,r=this.count;if(Ri.geometry=this.geometry,Ri.material=this.material,Ri.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),zi.copy(this.boundingSphere),zi.applyMatrix4(n),e.ray.intersectsSphere(zi)!==!1))for(let i=0;i<r;i++){this.getMatrixAt(i,Ni),Pi.multiplyMatrices(n,Ni),Ri.matrixWorld=Pi,Ri.raycast(e,Fi);for(let e=0,n=Fi.length;e<n;e++){let n=Fi[e];n.instanceId=i,n.object=this,t.push(n)}Fi.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new Mi(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let n=t.morphTargetInfluences,r=n.length+1;this.morphTexture===null&&(this.morphTexture=new ji(new Float32Array(r*this.count),r,this.count,se,T));let i=this.morphTexture.source.data.data,a=0;for(let e=0;e<n.length;e++)a+=n[e];let o=this.geometry.morphTargetsRelative?1:1-a,s=r*e;return i[s]=o,i.set(n,s+1),this}updateMorphTargets(){}dispose(){this.dispatchEvent({type:`dispose`}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Vi=new z,Hi=new z,Ui=new B,Wi=class{constructor(e=new z(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=Vi.subVectors(n,t).cross(Hi.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let r=e.delta(Vi),i=this.normal.dot(r);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/i;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(r,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Ui.getNormalMatrix(e),r=this.coplanarPoint(Vi).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},Gi=new Nr,Ki=new R(.5,.5),qi=new z,Ji=class{constructor(e=new Wi,t=new Wi,n=new Wi,r=new Wi,i=new Wi,a=new Wi){this.planes=[e,t,n,r,i,a]}set(e,t,n,r,i,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(i),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=rt,n=!1){let r=this.planes,i=e.elements,a=i[0],o=i[1],s=i[2],c=i[3],l=i[4],u=i[5],d=i[6],f=i[7],p=i[8],m=i[9],h=i[10],g=i[11],_=i[12],v=i[13],y=i[14],b=i[15];if(r[0].setComponents(c-a,f-l,g-p,b-_).normalize(),r[1].setComponents(c+a,f+l,g+p,b+_).normalize(),r[2].setComponents(c+o,f+u,g+m,b+v).normalize(),r[3].setComponents(c-o,f-u,g-m,b-v).normalize(),n)r[4].setComponents(s,d,h,y).normalize(),r[5].setComponents(c-s,f-d,g-h,b-y).normalize();else if(r[4].setComponents(c-s,f-d,g-h,b-y).normalize(),t===2e3)r[5].setComponents(c+s,f+d,g+h,b+y).normalize();else if(t===2001)r[5].setComponents(s,d,h,y).normalize();else throw Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: `+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Gi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Gi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Gi)}intersectsSprite(e){return Gi.center.set(0,0,0),Gi.radius=.7071067811865476+Ki.distanceTo(e.center),Gi.applyMatrix4(e.matrixWorld),this.intersectsSphere(Gi)}intersectsSphere(e){let t=this.planes,n=e.center,r=-e.radius;for(let e=0;e<6;e++)if(t[e].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let r=t[n];if(qi.x=r.normal.x>0?e.max.x:e.min.x,qi.y=r.normal.y>0?e.max.y:e.min.y,qi.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(qi)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},Yi=class extends Kr{constructor(e){super(),this.isLineBasicMaterial=!0,this.type=`LineBasicMaterial`,this.color=new H(16777215),this.map=null,this.linewidth=1,this.linecap=`round`,this.linejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},Xi=new z,Zi=new z,Qi=new un,$i=new gi,ea=new Nr,ta=new z,na=new z,ra=class extends Ln{constructor(e=new Vr,t=new Yi){super(),this.isLine=!0,this.type=`Line`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let e=1,r=t.count;e<r;e++)Xi.fromBufferAttribute(t,e-1),Zi.fromBufferAttribute(t,e),n[e]=n[e-1],n[e]+=Xi.distanceTo(Zi);e.setAttribute(`lineDistance`,new kr(n,1))}else F(`Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ea.copy(n.boundingSphere),ea.applyMatrix4(r),ea.radius+=i,e.ray.intersectsSphere(ea)===!1)return;Qi.copy(r).invert(),$i.copy(e.ray).applyMatrix4(Qi);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=this.isLineSegments?2:1,l=n.index,u=n.attributes.position;if(l!==null){let n=Math.max(0,a.start),r=Math.min(l.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=l.getX(i),r=l.getX(i+1),a=ia(this,e,$i,s,n,r,i);a&&t.push(a)}if(this.isLineLoop){let i=l.getX(r-1),a=l.getX(n),o=ia(this,e,$i,s,i,a,r-1);o&&t.push(o)}}else{let n=Math.max(0,a.start),r=Math.min(u.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=ia(this,e,$i,s,i,i+1,i);n&&t.push(n)}if(this.isLineLoop){let i=ia(this,e,$i,s,r-1,n,r-1);i&&t.push(i)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function ia(e,t,n,r,i,a,o){let s=e.geometry.attributes.position;if(Xi.fromBufferAttribute(s,i),Zi.fromBufferAttribute(s,a),n.distanceSqToSegment(Xi,Zi,ta,na)>r)return;ta.applyMatrix4(e.matrixWorld);let c=t.ray.origin.distanceTo(ta);if(!(c<t.near||c>t.far))return{distance:c,point:na.clone().applyMatrix4(e.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:e}}var aa=new z,oa=new z,sa=class extends ra{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type=`LineSegments`}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let e=0,r=t.count;e<r;e+=2)aa.fromBufferAttribute(t,e),oa.fromBufferAttribute(t,e+1),n[e]=e===0?0:n[e-1],n[e+1]=n[e]+aa.distanceTo(oa);e.setAttribute(`lineDistance`,new kr(n,1))}else F(`LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}},ca=class extends Kr{constructor(e){super(),this.isPointsMaterial=!0,this.type=`PointsMaterial`,this.color=new H(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},la=new un,ua=new gi,da=new Nr,fa=new z,pa=class extends Ln{constructor(e=new Vr,t=new ca){super(),this.isPoints=!0,this.type=`Points`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),da.copy(n.boundingSphere),da.applyMatrix4(r),da.radius+=i,e.ray.intersectsSphere(da)===!1)return;la.copy(r).invert(),ua.copy(e.ray).applyMatrix4(la);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=n.index,l=n.attributes.position;if(c!==null){let n=Math.max(0,a.start),i=Math.min(c.count,a.start+a.count);for(let a=n,o=i;a<o;a++){let n=c.getX(a);fa.fromBufferAttribute(l,n),ma(fa,n,s,r,e,t,this)}}else{let n=Math.max(0,a.start),i=Math.min(l.count,a.start+a.count);for(let a=n,o=i;a<o;a++)fa.fromBufferAttribute(l,a),ma(fa,a,s,r,e,t,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function ma(e,t,n,r,i,a,o){let s=ua.distanceSqToPoint(e);if(s<n){let n=new z;ua.closestPointToPoint(e,n),n.applyMatrix4(r);let c=i.ray.origin.distanceTo(n);if(c<i.near||c>i.far)return;a.push({distance:c,distanceToRay:Math.sqrt(s),point:n,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var ha=class extends rn{constructor(e=[],t=301,n,r,i,a,o,s,c,l){super(e,t,n,r,i,a,o,s,c,l),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},ga=class extends rn{constructor(e,t,n,r,i,a,o,s,c){super(e,t,n,r,i,a,o,s,c),this.isCanvasTexture=!0,this.needsUpdate=!0}},_a=class extends rn{constructor(e,t,n=w,r,i,a,o=p,s=p,c,l=ae,u=1){if(l!==1026&&l!==1027)throw Error(`THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat`);super({width:e,height:t,depth:u},r,i,a,o,s,l,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new $t(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},va=class extends _a{constructor(e,t=w,n=301,r,i,a=p,o=p,s,c=ae){let l={width:e,height:e,depth:1},u=[l,l,l,l,l,l];super(e,e,t,n,r,i,a,o,s,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},ya=class extends rn{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},ba=class e extends Vr{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new kr(c,3)),this.setAttribute(`normal`,new kr(l,3)),this.setAttribute(`uv`,new kr(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new z;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},xa=class e extends Vr{constructor(e=1,t=1,n=4,r=8,i=1){super(),this.type=`CapsuleGeometry`,this.parameters={radius:e,height:t,capSegments:n,radialSegments:r,heightSegments:i},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),r=Math.max(3,Math.floor(r)),i=Math.max(1,Math.floor(i));let a=[],o=[],s=[],c=[],l=t/2,u=Math.PI/2*e,d=t,f=2*u+d,p=n*2+i,m=r+1,h=new z,g=new z;for(let _=0;_<=p;_++){let v=0,y=0,b=0,x=0;if(_<=n){let t=_/n,r=t*Math.PI/2;y=-l-e*Math.cos(r),b=e*Math.sin(r),x=-e*Math.cos(r),v=t*u}else if(_<=n+i){let r=(_-n)/i;y=-l+r*t,b=e,x=0,v=u+r*d}else{let t=(_-n-i)/n,r=t*Math.PI/2;y=l+e*Math.sin(r),b=e*Math.cos(r),x=e*Math.sin(r),v=u+d+t*u}let S=Math.max(0,Math.min(1,v/f)),C=0;_===0?C=.5/r:_===p&&(C=-.5/r);for(let e=0;e<=r;e++){let t=e/r,n=t*Math.PI*2,i=Math.sin(n),a=Math.cos(n);g.x=-b*a,g.y=y,g.z=b*i,o.push(g.x,g.y,g.z),h.set(-b*a,x,b*i),h.normalize(),s.push(h.x,h.y,h.z),c.push(t+C,S)}if(_>0){let e=(_-1)*m;for(let t=0;t<r;t++){let n=e+t,r=e+t+1,i=_*m+t,o=_*m+t+1;a.push(n,r,i),a.push(r,o,i)}}}this.setIndex(a),this.setAttribute(`position`,new kr(o,3)),this.setAttribute(`normal`,new kr(s,3)),this.setAttribute(`uv`,new kr(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}},Sa=class e extends Vr{constructor(e=1,t=32,n=0,r=Math.PI*2){super(),this.type=`CircleGeometry`,this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:r},t=Math.max(3,t);let i=[],a=[],o=[],s=[],c=new z,l=new R;a.push(0,0,0),o.push(0,0,1),s.push(.5,.5);for(let i=0,u=3;i<=t;i++,u+=3){let d=n+i/t*r;c.x=e*Math.cos(d),c.y=e*Math.sin(d),a.push(c.x,c.y,c.z),o.push(0,0,1),l.x=(a[u]/e+1)/2,l.y=(a[u+1]/e+1)/2,s.push(l.x,l.y)}for(let e=1;e<=t;e++)i.push(e,e+1,0);this.setIndex(i),this.setAttribute(`position`,new kr(a,3)),this.setAttribute(`normal`,new kr(o,3)),this.setAttribute(`uv`,new kr(s,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.segments,t.thetaStart,t.thetaLength)}},Ca=class e extends Vr{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new kr(u,3)),this.setAttribute(`normal`,new kr(d,3)),this.setAttribute(`uv`,new kr(f,2));function _(){let a=new z,_=new z,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new R,m=new z,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},wa=class e extends Ca{constructor(e=1,t=1,n=32,r=1,i=!1,a=0,o=Math.PI*2){super(0,e,t,n,r,i,a,o),this.type=`ConeGeometry`,this.parameters={radius:e,height:t,radialSegments:n,heightSegments:r,openEnded:i,thetaStart:a,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ta=class e extends Vr{constructor(e=[],t=[],n=1,r=0){super(),this.type=`PolyhedronGeometry`,this.parameters={vertices:e,indices:t,radius:n,detail:r};let i=[],a=[];o(r),c(n),l(),this.setAttribute(`position`,new kr(i,3)),this.setAttribute(`normal`,new kr(i.slice(),3)),this.setAttribute(`uv`,new kr(a,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function o(e){let n=new z,r=new z,i=new z;for(let a=0;a<t.length;a+=3)f(t[a+0],n),f(t[a+1],r),f(t[a+2],i),s(n,r,i,e)}function s(e,t,n,r){let i=r+1,a=[];for(let r=0;r<=i;r++){a[r]=[];let o=e.clone().lerp(n,r/i),s=t.clone().lerp(n,r/i),c=i-r;for(let e=0;e<=c;e++)e===0&&r===i?a[r][e]=o:a[r][e]=o.clone().lerp(s,e/c)}for(let e=0;e<i;e++)for(let t=0;t<2*(i-e)-1;t++){let n=Math.floor(t/2);t%2==0?(d(a[e][n+1]),d(a[e+1][n]),d(a[e][n])):(d(a[e][n+1]),d(a[e+1][n+1]),d(a[e+1][n]))}}function c(e){let t=new z;for(let n=0;n<i.length;n+=3)t.x=i[n+0],t.y=i[n+1],t.z=i[n+2],t.normalize().multiplyScalar(e),i[n+0]=t.x,i[n+1]=t.y,i[n+2]=t.z}function l(){let e=new z;for(let t=0;t<i.length;t+=3){e.x=i[t+0],e.y=i[t+1],e.z=i[t+2];let n=h(e)/2/Math.PI+.5,r=g(e)/Math.PI+.5;a.push(n,1-r)}p(),u()}function u(){for(let e=0;e<a.length;e+=6){let t=a[e+0],n=a[e+2],r=a[e+4];Math.max(t,n,r)>.9&&Math.min(t,n,r)<.1&&(t<.2&&(a[e+0]+=1),n<.2&&(a[e+2]+=1),r<.2&&(a[e+4]+=1))}}function d(e){i.push(e.x,e.y,e.z)}function f(t,n){let r=t*3;n.x=e[r+0],n.y=e[r+1],n.z=e[r+2]}function p(){let e=new z,t=new z,n=new z,r=new z,o=new R,s=new R,c=new R;for(let l=0,u=0;l<i.length;l+=9,u+=6){e.set(i[l+0],i[l+1],i[l+2]),t.set(i[l+3],i[l+4],i[l+5]),n.set(i[l+6],i[l+7],i[l+8]),o.set(a[u+0],a[u+1]),s.set(a[u+2],a[u+3]),c.set(a[u+4],a[u+5]),r.copy(e).add(t).add(n).divideScalar(3);let d=h(r);m(o,u+0,e,d),m(s,u+2,t,d),m(c,u+4,n,d)}}function m(e,t,n,r){r<0&&e.x===1&&(a[t]=e.x-1),n.x===0&&n.z===0&&(a[t]=r/2/Math.PI+.5)}function h(e){return Math.atan2(e.z,-e.x)}function g(e){return Math.atan2(-e.y,Math.sqrt(e.x*e.x+e.z*e.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.vertices,t.indices,t.radius,t.detail)}},Ea=class{constructor(){this.type=`Curve`,this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){F(`Curve: .getPoint() not implemented.`)}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,r=this.getPoint(0),i=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),i+=n.distanceTo(r),t.push(i),r=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){let n=this.getLengths(),r=0,i=n.length,a;a=t||e*n[i-1];let o=0,s=i-1,c;for(;o<=s;)if(r=Math.floor(o+(s-o)/2),c=n[r]-a,c<0)o=r+1;else if(c>0)s=r-1;else{s=r;break}if(r=s,n[r]===a)return r/(i-1);let l=n[r],u=n[r+1]-l,d=(a-l)/u;return(r+d)/(i-1)}getTangent(e,t){let n=1e-4,r=e-n,i=e+n;r<0&&(r=0),i>1&&(i=1);let a=this.getPoint(r),o=this.getPoint(i),s=t||(a.isVector2?new R:new z);return s.copy(o).sub(a).normalize(),s}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t=!1){let n=new z,r=[],i=[],a=[],o=new z,s=new un;for(let t=0;t<=e;t++){let n=t/e;r[t]=this.getTangentAt(n,new z)}i[0]=new z,a[0]=new z;let c=Number.MAX_VALUE,l=Math.abs(r[0].x),u=Math.abs(r[0].y),d=Math.abs(r[0].z);l<=c&&(c=l,n.set(1,0,0)),u<=c&&(c=u,n.set(0,1,0)),d<=c&&n.set(0,0,1),o.crossVectors(r[0],n).normalize(),i[0].crossVectors(r[0],o),a[0].crossVectors(r[0],i[0]);for(let t=1;t<=e;t++){if(i[t]=i[t-1].clone(),a[t]=a[t-1].clone(),o.crossVectors(r[t-1],r[t]),o.length()>2**-52){o.normalize();let e=Math.acos(L(r[t-1].dot(r[t]),-1,1));i[t].applyMatrix4(s.makeRotationAxis(o,e))}a[t].crossVectors(r[t],i[t])}if(t===!0){let t=Math.acos(L(i[0].dot(i[e]),-1,1));t/=e,r[0].dot(o.crossVectors(i[0],i[e]))>0&&(t=-t);for(let n=1;n<=e;n++)i[n].applyMatrix4(s.makeRotationAxis(r[n],t*n)),a[n].crossVectors(r[n],i[n])}return{tangents:r,normals:i,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.7,type:`Curve`,generator:`Curve.toJSON`}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},Da=class extends Ea{constructor(e=0,t=0,n=1,r=1,i=0,a=Math.PI*2,o=!1,s=0){super(),this.isEllipseCurve=!0,this.type=`EllipseCurve`,this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=r,this.aStartAngle=i,this.aEndAngle=a,this.aClockwise=o,this.aRotation=s}getPoint(e,t=new R){let n=t,r=Math.PI*2,i=this.aEndAngle-this.aStartAngle,a=Math.abs(i)<2**-52;for(;i<0;)i+=r;for(;i>r;)i-=r;i<2**-52&&(i=a?0:r),this.aClockwise===!0&&!a&&(i===r?i=-r:i-=r);let o=this.aStartAngle+e*i,s=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let e=Math.cos(this.aRotation),t=Math.sin(this.aRotation),n=s-this.aX,r=c-this.aY;s=n*e-r*t+this.aX,c=n*t+r*e+this.aY}return n.set(s,c)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}},Oa=class extends Da{constructor(e,t,n,r,i,a){super(e,t,n,n,r,i,a),this.isArcCurve=!0,this.type=`ArcCurve`}};function ka(){let e=0,t=0,n=0,r=0;function i(i,a,o,s){e=i,t=o,n=-3*i+3*a-2*o-s,r=2*i-2*a+o+s}return{initCatmullRom:function(e,t,n,r,a){i(t,n,a*(n-e),a*(r-t))},initNonuniformCatmullRom:function(e,t,n,r,a,o,s){let c=(t-e)/a-(n-e)/(a+o)+(n-t)/o,l=(n-t)/o-(r-t)/(o+s)+(r-n)/s;c*=o,l*=o,i(t,n,c,l)},calc:function(i){let a=i*i,o=a*i;return e+t*i+n*a+r*o}}}var Aa=new z,ja=new z,Ma=new ka,Na=new ka,Pa=new ka,Fa=class extends Ea{constructor(e=[],t=!1,n=`centripetal`,r=.5){super(),this.isCatmullRomCurve3=!0,this.type=`CatmullRomCurve3`,this.points=e,this.closed=t,this.curveType=n,this.tension=r}getPoint(e,t=new z){let n=t,r=this.points,i=r.length,a=(i-+!this.closed)*e,o=Math.floor(a),s=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/i)+1)*i:s===0&&o===i-1&&(o=i-2,s=1);let c,l;this.closed||o>0?c=r[(o-1)%i]:(ja.subVectors(r[0],r[1]).add(r[0]),c=ja);let u=r[o%i],d=r[(o+1)%i];if(this.closed||o+2<i?l=r[(o+2)%i]:(Aa.subVectors(r[i-1],r[i-2]).add(r[i-1]),l=Aa),this.curveType===`centripetal`||this.curveType===`chordal`){let e=this.curveType===`chordal`?.5:.25,t=c.distanceToSquared(u)**+e,n=u.distanceToSquared(d)**+e,r=d.distanceToSquared(l)**+e;n<1e-4&&(n=1),t<1e-4&&(t=n),r<1e-4&&(r=n),Ma.initNonuniformCatmullRom(c.x,u.x,d.x,l.x,t,n,r),Na.initNonuniformCatmullRom(c.y,u.y,d.y,l.y,t,n,r),Pa.initNonuniformCatmullRom(c.z,u.z,d.z,l.z,t,n,r)}else this.curveType===`catmullrom`&&(Ma.initCatmullRom(c.x,u.x,d.x,l.x,this.tension),Na.initCatmullRom(c.y,u.y,d.y,l.y,this.tension),Pa.initCatmullRom(c.z,u.z,d.z,l.z,this.tension));return n.set(Ma.calc(s),Na.calc(s),Pa.calc(s)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new z().fromArray(n))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};function Ia(e,t,n,r,i){let a=(r-t)*.5,o=(i-n)*.5,s=e*e,c=e*s;return(2*n-2*r+a+o)*c+(-3*n+3*r-2*a-o)*s+a*e+n}function La(e,t){let n=1-e;return n*n*t}function Ra(e,t){return 2*(1-e)*e*t}function za(e,t){return e*e*t}function Ba(e,t,n,r){return La(e,t)+Ra(e,n)+za(e,r)}function Va(e,t){let n=1-e;return n*n*n*t}function Ha(e,t){let n=1-e;return 3*n*n*e*t}function Ua(e,t){return 3*(1-e)*e*e*t}function Wa(e,t){return e*e*e*t}function Ga(e,t,n,r,i){return Va(e,t)+Ha(e,n)+Ua(e,r)+Wa(e,i)}var Ka=class extends Ea{constructor(e=new R,t=new R,n=new R,r=new R){super(),this.isCubicBezierCurve=!0,this.type=`CubicBezierCurve`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new R){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(Ga(e,r.x,i.x,a.x,o.x),Ga(e,r.y,i.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},qa=class extends Ea{constructor(e=new z,t=new z,n=new z,r=new z){super(),this.isCubicBezierCurve3=!0,this.type=`CubicBezierCurve3`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new z){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(Ga(e,r.x,i.x,a.x,o.x),Ga(e,r.y,i.y,a.y,o.y),Ga(e,r.z,i.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},Ja=class extends Ea{constructor(e=new R,t=new R){super(),this.isLineCurve=!0,this.type=`LineCurve`,this.v1=e,this.v2=t}getPoint(e,t=new R){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new R){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Ya=class extends Ea{constructor(e=new z,t=new z){super(),this.isLineCurve3=!0,this.type=`LineCurve3`,this.v1=e,this.v2=t}getPoint(e,t=new z){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new z){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Xa=class extends Ea{constructor(e=new R,t=new R,n=new R){super(),this.isQuadraticBezierCurve=!0,this.type=`QuadraticBezierCurve`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new R){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(Ba(e,r.x,i.x,a.x),Ba(e,r.y,i.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Za=class extends Ea{constructor(e=new z,t=new z,n=new z){super(),this.isQuadraticBezierCurve3=!0,this.type=`QuadraticBezierCurve3`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new z){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(Ba(e,r.x,i.x,a.x),Ba(e,r.y,i.y,a.y),Ba(e,r.z,i.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Qa=class extends Ea{constructor(e=[]){super(),this.isSplineCurve=!0,this.type=`SplineCurve`,this.points=e}getPoint(e,t=new R){let n=t,r=this.points,i=(r.length-1)*e,a=Math.floor(i),o=i-a,s=r[a===0?a:a-1],c=r[a],l=r[a>r.length-2?r.length-1:a+1],u=r[a>r.length-3?r.length-1:a+2];return n.set(Ia(o,s.x,c.x,l.x,u.x),Ia(o,s.y,c.y,l.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new R().fromArray(n))}return this}},$a=Object.freeze({__proto__:null,ArcCurve:Oa,CatmullRomCurve3:Fa,CubicBezierCurve:Ka,CubicBezierCurve3:qa,EllipseCurve:Da,LineCurve:Ja,LineCurve3:Ya,QuadraticBezierCurve:Xa,QuadraticBezierCurve3:Za,SplineCurve:Qa}),eo=class extends Ea{constructor(){super(),this.type=`CurvePath`,this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){let n=e.isVector2===!0?`LineCurve`:`LineCurve3`;this.curves.push(new $a[n](t,e))}return this}getPoint(e,t){let n=e*this.getLength(),r=this.getCurveLengths(),i=0;for(;i<r.length;){if(r[i]>=n){let e=r[i]-n,a=this.curves[i],o=a.getLength(),s=o===0?0:1-e/o;return a.getPointAt(s,t)}i++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,r=this.curves.length;n<r;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let r=0,i=this.curves;r<i.length;r++){let a=i[r],o=a.isEllipseCurve?e*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,s=a.getPoints(o);for(let e=0;e<s.length;e++){let r=s[e];n&&n.equals(r)||(t.push(r),n=r)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(n.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let n=this.curves[t];e.curves.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(new $a[n.type]().fromJSON(n))}return this}},to=class extends eo{constructor(e){super(),this.type=`Path`,this.currentPoint=new R,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new Ja(this.currentPoint.clone(),new R(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,r){let i=new Xa(this.currentPoint.clone(),new R(e,t),new R(n,r));return this.curves.push(i),this.currentPoint.set(n,r),this}bezierCurveTo(e,t,n,r,i,a){let o=new Ka(this.currentPoint.clone(),new R(e,t),new R(n,r),new R(i,a));return this.curves.push(o),this.currentPoint.set(i,a),this}splineThru(e){let t=new Qa([this.currentPoint.clone()].concat(e));return this.curves.push(t),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,r,i,a){let o=this.currentPoint.x,s=this.currentPoint.y;return this.absarc(e+o,t+s,n,r,i,a),this}absarc(e,t,n,r,i,a){return this.absellipse(e,t,n,n,r,i,a),this}ellipse(e,t,n,r,i,a,o,s){let c=this.currentPoint.x,l=this.currentPoint.y;return this.absellipse(e+c,t+l,n,r,i,a,o,s),this}absellipse(e,t,n,r,i,a,o,s){let c=new Da(e,t,n,r,i,a,o,s);if(this.curves.length>0){let e=c.getPoint(0);e.equals(this.currentPoint)||this.lineTo(e.x,e.y)}this.curves.push(c);let l=c.getPoint(1);return this.currentPoint.copy(l),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},no=class extends to{constructor(e){super(e),this.uuid=yt(),this.type=`Shape`,this.holes=[]}getPointsHoles(e){let t=[];for(let n=0,r=this.holes.length;n<r;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){let n=this.holes[t];e.holes.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(new to().fromJSON(n))}return this}};function ro(e,t,n=2){let r=t&&t.length,i=r?t[0]*n:e.length,a=io(e,0,i,n,!0),o=[];if(!a||a.next===a.prev)return o;let s,c,l;if(r&&(a=fo(e,t,a,n)),e.length>80*n){s=e[0],c=e[1];let t=s,r=c;for(let a=n;a<i;a+=n){let n=e[a],i=e[a+1];n<s&&(s=n),i<c&&(c=i),n>t&&(t=n),i>r&&(r=i)}l=Math.max(t-s,r-c),l=l===0?0:32767/l}return oo(a,o,n,s,c,l,0),o}function io(e,t,n,r,i){let a;if(i===Io(e,t,n,r)>0)for(let i=t;i<n;i+=r)a=No(i/r|0,e[i],e[i+1],a);else for(let i=n-r;i>=t;i-=r)a=No(i/r|0,e[i],e[i+1],a);return a&&To(a,a.next)&&(Po(a),a=a.next),a}function ao(e,t){if(!e)return e;t||=e;let n=e,r;do if(r=!1,!n.steiner&&(To(n,n.next)||wo(n.prev,n,n.next)===0)){if(Po(n),n=t=n.prev,n===n.next)break;r=!0}else n=n.next;while(r||n!==t);return t}function oo(e,t,n,r,i,a,o){if(!e)return;!o&&a&&_o(e,r,i,a);let s=e;for(;e.prev!==e.next;){let c=e.prev,l=e.next;if(a?co(e,r,i,a):so(e)){t.push(c.i,e.i,l.i),Po(e),e=l.next,s=l.next;continue}if(e=l,e===s){o?o===1?(e=lo(ao(e),t),oo(e,t,n,r,i,a,2)):o===2&&uo(e,t,n,r,i,a):oo(ao(e),t,n,r,i,a,1);break}}}function so(e){let t=e.prev,n=e,r=e.next;if(wo(t,n,r)>=0)return!1;let i=t.x,a=n.x,o=r.x,s=t.y,c=n.y,l=r.y,u=Math.min(i,a,o),d=Math.min(s,c,l),f=Math.max(i,a,o),p=Math.max(s,c,l),m=r.next;for(;m!==t;){if(m.x>=u&&m.x<=f&&m.y>=d&&m.y<=p&&So(i,s,a,c,o,l,m.x,m.y)&&wo(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function co(e,t,n,r){let i=e.prev,a=e,o=e.next;if(wo(i,a,o)>=0)return!1;let s=i.x,c=a.x,l=o.x,u=i.y,d=a.y,f=o.y,p=Math.min(s,c,l),m=Math.min(u,d,f),h=Math.max(s,c,l),g=Math.max(u,d,f),_=yo(p,m,t,n,r),v=yo(h,g,t,n,r),y=e.prevZ,b=e.nextZ;for(;y&&y.z>=_&&b&&b.z<=v;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&So(s,u,c,d,l,f,y.x,y.y)&&wo(y.prev,y,y.next)>=0||(y=y.prevZ,b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&So(s,u,c,d,l,f,b.x,b.y)&&wo(b.prev,b,b.next)>=0))return!1;b=b.nextZ}for(;y&&y.z>=_;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&So(s,u,c,d,l,f,y.x,y.y)&&wo(y.prev,y,y.next)>=0)return!1;y=y.prevZ}for(;b&&b.z<=v;){if(b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&So(s,u,c,d,l,f,b.x,b.y)&&wo(b.prev,b,b.next)>=0)return!1;b=b.nextZ}return!0}function lo(e,t){let n=e;do{let r=n.prev,i=n.next.next;!To(r,i)&&Eo(r,n,n.next,i)&&Ao(r,i)&&Ao(i,r)&&(t.push(r.i,n.i,i.i),Po(n),Po(n.next),n=e=i),n=n.next}while(n!==e);return ao(n)}function uo(e,t,n,r,i,a){let o=e;do{let e=o.next.next;for(;e!==o.prev;){if(o.i!==e.i&&Co(o,e)){let s=Mo(o,e);o=ao(o,o.next),s=ao(s,s.next),oo(o,t,n,r,i,a,0),oo(s,t,n,r,i,a,0);return}e=e.next}o=o.next}while(o!==e)}function fo(e,t,n,r){let i=[];for(let n=0,a=t.length;n<a;n++){let o=io(e,t[n]*r,n<a-1?t[n+1]*r:e.length,r,!1);o===o.next&&(o.steiner=!0),i.push(bo(o))}i.sort(po);for(let e=0;e<i.length;e++)n=mo(i[e],n);return n}function po(e,t){let n=e.x-t.x;return n===0&&(n=e.y-t.y,n===0&&(n=(e.next.y-e.y)/(e.next.x-e.x)-(t.next.y-t.y)/(t.next.x-t.x))),n}function mo(e,t){let n=ho(e,t);if(!n)return t;let r=Mo(n,e);return ao(r,r.next),ao(n,n.next)}function ho(e,t){let n=t,r=e.x,i=e.y,a=-1/0,o;if(To(e,n))return n;do{if(To(e,n.next))return n.next;if(i<=n.y&&i>=n.next.y&&n.next.y!==n.y){let e=n.x+(i-n.y)*(n.next.x-n.x)/(n.next.y-n.y);if(e<=r&&e>a&&(a=e,o=n.x<n.next.x?n:n.next,e===r))return o}n=n.next}while(n!==t);if(!o)return null;let s=o,c=o.x,l=o.y,u=1/0;n=o;do{if(r>=n.x&&n.x>=c&&r!==n.x&&xo(i<l?r:a,i,c,l,i<l?a:r,i,n.x,n.y)){let t=Math.abs(i-n.y)/(r-n.x);Ao(n,e)&&(t<u||t===u&&(n.x>o.x||n.x===o.x&&go(o,n)))&&(o=n,u=t)}n=n.next}while(n!==s);return o}function go(e,t){return wo(e.prev,e,t.prev)<0&&wo(t.next,e,e.next)<0}function _o(e,t,n,r){let i=e;do i.z===0&&(i.z=yo(i.x,i.y,t,n,r)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==e);i.prevZ.nextZ=null,i.prevZ=null,vo(i)}function vo(e){let t,n=1;do{let r=e,i;e=null;let a=null;for(t=0;r;){t++;let o=r,s=0;for(let e=0;e<n&&(s++,o=o.nextZ,o);e++);let c=n;for(;s>0||c>0&&o;)s!==0&&(c===0||!o||r.z<=o.z)?(i=r,r=r.nextZ,s--):(i=o,o=o.nextZ,c--),a?a.nextZ=i:e=i,i.prevZ=a,a=i;r=o}a.nextZ=null,n*=2}while(t>1);return e}function yo(e,t,n,r,i){return e=(e-n)*i|0,t=(t-r)*i|0,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,e|t<<1}function bo(e){let t=e,n=e;do(t.x<n.x||t.x===n.x&&t.y<n.y)&&(n=t),t=t.next;while(t!==e);return n}function xo(e,t,n,r,i,a,o,s){return(i-o)*(t-s)>=(e-o)*(a-s)&&(e-o)*(r-s)>=(n-o)*(t-s)&&(n-o)*(a-s)>=(i-o)*(r-s)}function So(e,t,n,r,i,a,o,s){return!(e===o&&t===s)&&xo(e,t,n,r,i,a,o,s)}function Co(e,t){return e.next.i!==t.i&&e.prev.i!==t.i&&!ko(e,t)&&(Ao(e,t)&&Ao(t,e)&&jo(e,t)&&(wo(e.prev,e,t.prev)||wo(e,t.prev,t))||To(e,t)&&wo(e.prev,e,e.next)>0&&wo(t.prev,t,t.next)>0)}function wo(e,t,n){return(t.y-e.y)*(n.x-t.x)-(t.x-e.x)*(n.y-t.y)}function To(e,t){return e.x===t.x&&e.y===t.y}function Eo(e,t,n,r){let i=Oo(wo(e,t,n)),a=Oo(wo(e,t,r)),o=Oo(wo(n,r,e)),s=Oo(wo(n,r,t));return!!(i!==a&&o!==s||i===0&&Do(e,n,t)||a===0&&Do(e,r,t)||o===0&&Do(n,e,r)||s===0&&Do(n,t,r))}function Do(e,t,n){return t.x<=Math.max(e.x,n.x)&&t.x>=Math.min(e.x,n.x)&&t.y<=Math.max(e.y,n.y)&&t.y>=Math.min(e.y,n.y)}function Oo(e){return e>0?1:e<0?-1:0}function ko(e,t){let n=e;do{if(n.i!==e.i&&n.next.i!==e.i&&n.i!==t.i&&n.next.i!==t.i&&Eo(n,n.next,e,t))return!0;n=n.next}while(n!==e);return!1}function Ao(e,t){return wo(e.prev,e,e.next)<0?wo(e,t,e.next)>=0&&wo(e,e.prev,t)>=0:wo(e,t,e.prev)<0||wo(e,e.next,t)<0}function jo(e,t){let n=e,r=!1,i=(e.x+t.x)/2,a=(e.y+t.y)/2;do n.y>a!=n.next.y>a&&n.next.y!==n.y&&i<(n.next.x-n.x)*(a-n.y)/(n.next.y-n.y)+n.x&&(r=!r),n=n.next;while(n!==e);return r}function Mo(e,t){let n=Fo(e.i,e.x,e.y),r=Fo(t.i,t.x,t.y),i=e.next,a=t.prev;return e.next=t,t.prev=e,n.next=i,i.prev=n,r.next=n,n.prev=r,a.next=r,r.prev=a,r}function No(e,t,n,r){let i=Fo(e,t,n);return r?(i.next=r.next,i.prev=r,r.next.prev=i,r.next=i):(i.prev=i,i.next=i),i}function Po(e){e.next.prev=e.prev,e.prev.next=e.next,e.prevZ&&(e.prevZ.nextZ=e.nextZ),e.nextZ&&(e.nextZ.prevZ=e.prevZ)}function Fo(e,t,n){return{i:e,x:t,y:n,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function Io(e,t,n,r){let i=0;for(let a=t,o=n-r;a<n;a+=r)i+=(e[o]-e[a])*(e[a+1]+e[o+1]),o=a;return i}var Lo=class{static triangulate(e,t,n=2){return ro(e,t,n)}},Ro=class e{static area(e){let t=e.length,n=0;for(let r=t-1,i=0;i<t;r=i++)n+=e[r].x*e[i].y-e[i].x*e[r].y;return n*.5}static isClockWise(t){return e.area(t)<0}static triangulateShape(e,t){let n=[],r=[],i=[];zo(e),Bo(n,e);let a=e.length;t.forEach(zo);for(let e=0;e<t.length;e++)r.push(a),a+=t[e].length,Bo(n,t[e]);let o=Lo.triangulate(n,r);for(let e=0;e<o.length;e+=3)i.push(o.slice(e,e+3));return i}};function zo(e){let t=e.length;t>2&&e[t-1].equals(e[0])&&e.pop()}function Bo(e,t){for(let n=0;n<t.length;n++)e.push(t[n].x),e.push(t[n].y)}var Vo=class e extends Ta{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,r=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1];super(r,[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1],e,t),this.type=`IcosahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},Ho=class e extends Vr{constructor(e=1,t=1,n=1,r=1){super(),this.type=`PlaneGeometry`,this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};let i=e/2,a=t/2,o=Math.floor(n),s=Math.floor(r),c=o+1,l=s+1,u=e/o,d=t/s,f=[],p=[],m=[],h=[];for(let e=0;e<l;e++){let t=e*d-a;for(let n=0;n<c;n++){let r=n*u-i;p.push(r,-t,0),m.push(0,0,1),h.push(n/o),h.push(1-e/s)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=t+c*e,r=t+c*(e+1),i=t+1+c*(e+1),a=t+1+c*e;f.push(n,r,a),f.push(r,i,a)}this.setIndex(f),this.setAttribute(`position`,new kr(p,3)),this.setAttribute(`normal`,new kr(m,3)),this.setAttribute(`uv`,new kr(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},Uo=class e extends Vr{constructor(e=new no([new R(0,.5),new R(-.5,-.5),new R(.5,-.5)]),t=12){super(),this.type=`ShapeGeometry`,this.parameters={shapes:e,curveSegments:t};let n=[],r=[],i=[],a=[],o=0,s=0;if(Array.isArray(e)===!1)c(e);else for(let t=0;t<e.length;t++)c(e[t]),this.addGroup(o,s,t),o+=s,s=0;this.setIndex(n),this.setAttribute(`position`,new kr(r,3)),this.setAttribute(`normal`,new kr(i,3)),this.setAttribute(`uv`,new kr(a,2));function c(e){let o=r.length/3,c=e.extractPoints(t),l=c.shape,u=c.holes;Ro.isClockWise(l)===!1&&(l=l.reverse());for(let e=0,t=u.length;e<t;e++){let t=u[e];Ro.isClockWise(t)===!0&&(u[e]=t.reverse())}let d=Ro.triangulateShape(l,u);for(let e=0,t=u.length;e<t;e++){let t=u[e];l=l.concat(t)}for(let e=0,t=l.length;e<t;e++){let t=l[e];r.push(t.x,t.y,0),i.push(0,0,1),a.push(t.x,t.y)}for(let e=0,t=d.length;e<t;e++){let t=d[e],r=t[0]+o,i=t[1]+o,a=t[2]+o;n.push(r,i,a),s+=3}}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON(),t=this.parameters.shapes;return Wo(t,e)}static fromJSON(t,n){let r=[];for(let e=0,i=t.shapes.length;e<i;e++){let i=n[t.shapes[e]];r.push(i)}return new e(r,t.curveSegments)}};function Wo(e,t){if(t.shapes=[],Array.isArray(e))for(let n=0,r=e.length;n<r;n++){let r=e[n];t.shapes.push(r.uuid)}else t.shapes.push(e.uuid);return t}var Go=class e extends Vr{constructor(e=1,t=32,n=16,r=0,i=Math.PI*2,a=0,o=Math.PI){super(),this.type=`SphereGeometry`,this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:i,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let s=Math.min(a+o,Math.PI),c=0,l=[],u=new z,d=new z,f=[],p=[],m=[],h=[];for(let f=0;f<=n;f++){let g=[],_=f/n,v=a+_*o,y=e*Math.cos(v),b=Math.sqrt(e*e-y*y),x=0;f===0&&a===0?x=.5/t:f===n&&s===Math.PI&&(x=-.5/t);for(let e=0;e<=t;e++){let n=e/t,a=r+n*i;u.x=-b*Math.cos(a),u.y=y,u.z=b*Math.sin(a),p.push(u.x,u.y,u.z),d.copy(u).normalize(),m.push(d.x,d.y,d.z),h.push(n+x,1-_),g.push(c++)}l.push(g)}for(let e=0;e<n;e++)for(let r=0;r<t;r++){let t=l[e][r+1],i=l[e][r],o=l[e+1][r],c=l[e+1][r+1];(e!==0||a>0)&&f.push(t,i,c),(e!==n-1||s<Math.PI)&&f.push(i,o,c)}this.setIndex(f),this.setAttribute(`position`,new kr(p,3)),this.setAttribute(`normal`,new kr(m,3)),this.setAttribute(`uv`,new kr(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},Ko=class e extends Vr{constructor(e=1,t=.4,n=12,r=48,i=Math.PI*2,a=0,o=Math.PI*2){super(),this.type=`TorusGeometry`,this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:i,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);let s=[],c=[],l=[],u=[],d=new z,f=new z,p=new z;for(let s=0;s<=n;s++){let m=a+s/n*o;for(let a=0;a<=r;a++){let o=a/r*i;f.x=(e+t*Math.cos(m))*Math.cos(o),f.y=(e+t*Math.cos(m))*Math.sin(o),f.z=t*Math.sin(m),c.push(f.x,f.y,f.z),d.x=e*Math.cos(o),d.y=e*Math.sin(o),p.subVectors(f,d).normalize(),l.push(p.x,p.y,p.z),u.push(a/r),u.push(s/n)}}for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*e+t-1,i=(r+1)*(e-1)+t-1,a=(r+1)*(e-1)+t,o=(r+1)*e+t;s.push(n,i,o),s.push(i,a,o)}this.setIndex(s),this.setAttribute(`position`,new kr(c,3)),this.setAttribute(`normal`,new kr(l,3)),this.setAttribute(`uv`,new kr(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}};function qo(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];if(Yo(i))i.isRenderTargetTexture?(F(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone();else if(Array.isArray(i))if(Yo(i[0])){let e=[];for(let t=0,n=i.length;t<n;t++)e[t]=i[t].clone();t[n][r]=e}else t[n][r]=i.slice();else t[n][r]=i}}return t}function Jo(e){let t={};for(let n=0;n<e.length;n++){let r=qo(e[n]);for(let e in r)t[e]=r[e]}return t}function Yo(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function Xo(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Zo(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:V.workingColorSpace}var Qo={clone:qo,merge:Jo},$o=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,es=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,ts=class extends Kr{constructor(e){super(),this.isShaderMaterial=!0,this.type=`ShaderMaterial`,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=$o,this.fragmentShader=es,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=qo(e.uniforms),this.uniformsGroups=Xo(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let n in this.uniforms){let r=this.uniforms[n].value;r&&r.isTexture?t.uniforms[n]={type:`t`,value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[n]={type:`c`,value:r.getHex()}:r&&r.isVector2?t.uniforms[n]={type:`v2`,value:r.toArray()}:r&&r.isVector3?t.uniforms[n]={type:`v3`,value:r.toArray()}:r&&r.isVector4?t.uniforms[n]={type:`v4`,value:r.toArray()}:r&&r.isMatrix3?t.uniforms[n]={type:`m3`,value:r.toArray()}:r&&r.isMatrix4?t.uniforms[n]={type:`m4`,value:r.toArray()}:t.uniforms[n]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let e in this.extensions)this.extensions[e]===!0&&(n[e]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let r=e.uniforms[n];switch(this.uniforms[n]={},r.type){case`t`:this.uniforms[n].value=t[r.value]||null;break;case`c`:this.uniforms[n].value=new H().setHex(r.value);break;case`v2`:this.uniforms[n].value=new R().fromArray(r.value);break;case`v3`:this.uniforms[n].value=new z().fromArray(r.value);break;case`v4`:this.uniforms[n].value=new an().fromArray(r.value);break;case`m3`:this.uniforms[n].value=new B().fromArray(r.value);break;case`m4`:this.uniforms[n].value=new un().fromArray(r.value);break;default:this.uniforms[n].value=r.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let t in e.extensions)this.extensions[t]=e.extensions[t];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},ns=class extends ts{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type=`RawShaderMaterial`}},W=class extends Kr{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`,this.defines={STANDARD:``},this.color=new H(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new H(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new R(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new bn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:``},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},rs=class extends W{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:``,PHYSICAL:``},this.type=`MeshPhysicalMaterial`,this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new R(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return L(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new H(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new H(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new H(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:``,PHYSICAL:``},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}},is=class extends Kr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type=`MeshDepthMaterial`,this.depthPacking=Xe,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},as=class extends Kr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type=`MeshDistanceMaterial`,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function os(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}var ss=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`THREE.Interpolant: Call to abstract method.`)}intervalChanged_(){}},cs=class extends ss{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:qe,endingEnd:qe}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case Je:i=e,o=2*t-n;break;case Ye:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case Je:a=e,s=2*n-t;break;case Ye:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let c=(n-t)*.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(s-n),this._offsetPrev=i*l,this._offsetNext=a*l}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},ls=class extends ss{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},us=class extends ss{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},ds=class extends ss{interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this.inTangents,u=this.outTangents;if(!l||!u){let e=(n-t)/(r-t),l=1-e;for(let t=0;t!==o;++t)i[t]=a[c+t]*l+a[s+t]*e;return i}let d=o*2,f=e-1;for(let p=0;p!==o;++p){let o=a[c+p],m=a[s+p],h=f*d+p*2,g=u[h],_=u[h+1],v=e*d+p*2,y=l[v],b=l[v+1],x=(n-t)/(r-t),S,C,w,T,E;for(let e=0;e<8;e++){S=x*x,C=S*x,w=1-x,T=w*w,E=T*w;let e=E*t+3*T*x*g+3*w*S*y+C*r-n;if(Math.abs(e)<1e-10)break;let i=3*T*(g-t)+6*w*x*(y-g)+3*S*(r-y);if(Math.abs(i)<1e-10)break;x-=e/i,x=Math.max(0,Math.min(1,x))}i[p]=E*o+3*T*x*_+3*w*S*b+C*m}return i}},fs=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=os(t,this.TimeBufferType),this.values=os(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:os(e.times,Array),values:os(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new us(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new ls(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new cs(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new ds(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case Ue:t=this.InterpolantFactoryMethodDiscrete;break;case We:t=this.InterpolantFactoryMethodLinear;break;case Ge:t=this.InterpolantFactoryMethodSmooth;break;case Ke:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t);return F(`KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Ue;case this.InterpolantFactoryMethodLinear:return We;case this.InterpolantFactoryMethodSmooth:return Ge;case this.InterpolantFactoryMethodBezier:return Ke}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(I(`KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(I(`KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){I(`KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){I(`KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&at(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){I(`KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===Ge,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0]))if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};fs.prototype.ValueTypeName=``,fs.prototype.TimeBufferType=Float32Array,fs.prototype.ValueBufferType=Float32Array,fs.prototype.DefaultInterpolation=We;var ps=class extends fs{constructor(e,t,n){super(e,t,n)}};ps.prototype.ValueTypeName=`bool`,ps.prototype.ValueBufferType=Array,ps.prototype.DefaultInterpolation=Ue,ps.prototype.InterpolantFactoryMethodLinear=void 0,ps.prototype.InterpolantFactoryMethodSmooth=void 0;var ms=class extends fs{constructor(e,t,n,r){super(e,t,n,r)}};ms.prototype.ValueTypeName=`color`;var hs=class extends fs{constructor(e,t,n,r){super(e,t,n,r)}};hs.prototype.ValueTypeName=`number`;var gs=class extends ss{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)Vt.slerpFlat(i,0,a,c-o,a,c,s);return i}},_s=class extends fs{constructor(e,t,n,r){super(e,t,n,r)}InterpolantFactoryMethodLinear(e){return new gs(this.times,this.values,this.getValueSize(),e)}};_s.prototype.ValueTypeName=`quaternion`,_s.prototype.InterpolantFactoryMethodSmooth=void 0;var vs=class extends fs{constructor(e,t,n){super(e,t,n)}};vs.prototype.ValueTypeName=`string`,vs.prototype.ValueBufferType=Array,vs.prototype.DefaultInterpolation=Ue,vs.prototype.InterpolantFactoryMethodLinear=void 0,vs.prototype.InterpolantFactoryMethodSmooth=void 0;var ys=class extends fs{constructor(e,t,n,r){super(e,t,n,r)}};ys.prototype.ValueTypeName=`vector`;var bs={enabled:!1,files:{},add:function(e,t){this.enabled!==!1&&(xs(e)||(this.files[e]=t))},get:function(e){if(this.enabled!==!1&&!xs(e))return this.files[e]},remove:function(e){delete this.files[e]},clear:function(){this.files={}}};function xs(e){try{let t=e.slice(e.indexOf(`:`)+1);return new URL(t).protocol===`blob:`}catch{return!1}}var Ss=new class{constructor(e,t,n){let r=this,i=!1,a=0,o=0,s,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(e){o++,i===!1&&r.onStart!==void 0&&r.onStart(e,a,o),i=!0},this.itemEnd=function(e){a++,r.onProgress!==void 0&&r.onProgress(e,a,o),a===o&&(i=!1,r.onLoad!==void 0&&r.onLoad())},this.itemError=function(e){r.onError!==void 0&&r.onError(e)},this.resolveURL=function(e){return e=e.normalize(`NFC`),s?s(e):e},this.setURLModifier=function(e){return s=e,this},this.addHandler=function(e,t){return c.push(e,t),this},this.removeHandler=function(e){let t=c.indexOf(e);return t!==-1&&c.splice(t,2),this},this.getHandler=function(e){for(let t=0,n=c.length;t<n;t+=2){let n=c[t],r=c[t+1];if(n.global&&(n.lastIndex=0),n.test(e))return r}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||=new AbortController,this._abortController}},Cs=class{constructor(e){this.manager=e===void 0?Ss:e,this.crossOrigin=`anonymous`,this.withCredentials=!1,this.path=``,this.resourcePath=``,this.requestHeader={},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(r,i){n.load(e,r,t,i)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}};Cs.DEFAULT_MATERIAL_NAME=`__DEFAULT`;var ws=new WeakMap,Ts=class extends Cs{constructor(e){super(e)}load(e,t,n,r){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let i=this,a=bs.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)i.manager.itemStart(e),setTimeout(function(){t&&t(a),i.manager.itemEnd(e)},0);else{let e=ws.get(a);e===void 0&&(e=[],ws.set(a,e)),e.push({onLoad:t,onError:r})}return a}let o=ot(`img`);function s(){l(),t&&t(this);let n=ws.get(this)||[];for(let e=0;e<n.length;e++){let t=n[e];t.onLoad&&t.onLoad(this)}ws.delete(this),i.manager.itemEnd(e)}function c(t){l(),r&&r(t),bs.remove(`image:${e}`);let n=ws.get(this)||[];for(let e=0;e<n.length;e++){let r=n[e];r.onError&&r.onError(t)}ws.delete(this),i.manager.itemError(e),i.manager.itemEnd(e)}function l(){o.removeEventListener(`load`,s,!1),o.removeEventListener(`error`,c,!1)}return o.addEventListener(`load`,s,!1),o.addEventListener(`error`,c,!1),e.slice(0,5)!==`data:`&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),bs.add(`image:${e}`,o),i.manager.itemStart(e),o.src=e,o}},Es=class extends Cs{constructor(e){super(e)}load(e,t,n,r){let i=new rn,a=new Ts(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(e){i.image=e,i.needsUpdate=!0,t!==void 0&&t(i)},n,r),i}},Ds=class extends Ln{constructor(e,t=1){super(),this.isLight=!0,this.type=`Light`,this.color=new H(e),this.intensity=t}dispose(){this.dispatchEvent({type:`dispose`})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},Os=class extends Ds{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type=`HemisphereLight`,this.position.copy(Ln.DEFAULT_UP),this.updateMatrix(),this.groundColor=new H(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},ks=new un,As=new z,js=new z,Ms=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new R(512,512),this.mapType=y,this.map=null,this.mapPass=null,this.matrix=new un,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ji,this._frameExtents=new R(1,1),this._viewportCount=1,this._viewports=[new an(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;As.setFromMatrixPosition(e.matrixWorld),t.position.copy(As),js.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(js),t.updateMatrixWorld(),ks.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ks,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===2001||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(ks)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Ns=new z,Ps=new Vt,Fs=new z,Is=class extends Ln{constructor(){super(),this.isCamera=!0,this.type=`Camera`,this.matrixWorldInverse=new un,this.projectionMatrix=new un,this.projectionMatrixInverse=new un,this.coordinateSystem=rt,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Ns,Ps,Fs),Fs.x===1&&Fs.y===1&&Fs.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ns,Ps,Fs.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Ns,Ps,Fs),Fs.x===1&&Fs.y===1&&Fs.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ns,Ps,Fs.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Ls=new z,Rs=new R,zs=new R,Bs=class extends Is{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type=`PerspectiveCamera`,this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=vt*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(_t*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return vt*2*Math.atan(Math.tan(_t*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Ls.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Ls.x,Ls.y).multiplyScalar(-e/Ls.z),Ls.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Ls.x,Ls.y).multiplyScalar(-e/Ls.z)}getViewSize(e,t){return this.getViewBounds(e,Rs,zs),t.subVectors(zs,Rs)}setViewOffset(e,t,n,r,i,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(_t*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,i=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let e=a.fullWidth,o=a.fullHeight;i+=a.offsetX*r/e,t-=a.offsetY*n/o,r*=a.width/e,n*=a.height/o}let o=this.filmOffset;o!==0&&(i+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(i,i+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Vs=class extends Ms{constructor(){super(new Bs(90,1,.5,500)),this.isPointLightShadow=!0}},Hs=class extends Ds{constructor(e,t,n=0,r=2){super(e,t),this.isPointLight=!0,this.type=`PointLight`,this.distance=n,this.decay=r,this.shadow=new Vs}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},Us=class extends Is{constructor(e=-1,t=1,n=1,r=-1,i=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type=`OrthographicCamera`,this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=i,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,i,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2,i=n-e,a=n+e,o=r+t,s=r-t;if(this.view!==null&&this.view.enabled){let e=(this.right-this.left)/this.view.fullWidth/this.zoom,t=(this.top-this.bottom)/this.view.fullHeight/this.zoom;i+=e*this.view.offsetX,a=i+e*this.view.width,o-=t*this.view.offsetY,s=o-t*this.view.height}this.projectionMatrix.makeOrthographic(i,a,o,s,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Ws=class extends Ms{constructor(){super(new Us(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Gs=class extends Ds{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type=`DirectionalLight`,this.position.copy(Ln.DEFAULT_UP),this.updateMatrix(),this.target=new Ln,this.shadow=new Ws}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},Ks=class extends Ds{constructor(e,t){super(e,t),this.isAmbientLight=!0,this.type=`AmbientLight`}},qs=-90,Js=1,Ys=class extends Ln{constructor(e,t,n){super(),this.type=`CubeCamera`,this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new Bs(qs,Js,e,t);r.layers=this.layers,this.add(r);let i=new Bs(qs,Js,e,t);i.layers=this.layers,this.add(i);let a=new Bs(qs,Js,e,t);a.layers=this.layers,this.add(a);let o=new Bs(qs,Js,e,t);o.layers=this.layers,this.add(o);let s=new Bs(qs,Js,e,t);s.layers=this.layers,this.add(s);let c=new Bs(qs,Js,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,r,i,a,o,s]=t;for(let e of t)this.remove(e);if(e===2e3)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),i.up.set(0,0,-1),i.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),s.up.set(0,1,0),s.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),i.up.set(0,0,1),i.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),s.up.set(0,-1,0),s.lookAt(0,0,-1);else throw Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: `+e);for(let e of t)this.add(e),e.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[i,a,o,s,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let m=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let h=!1;h=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,i),e.setRenderTarget(n,1,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,4,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=m,e.setRenderTarget(n,5,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(u,d,f),e.xr.enabled=p,n.texture.needsPMREMUpdate=!0}},Xs=class extends Bs{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},Zs=`\\[\\]\\.:\\/`,Qs=RegExp(`[\\[\\]\\.:\\/]`,`g`),$s=`[^\\[\\]\\.:\\/]`,ec=`[^`+Zs.replace(`\\.`,``)+`]`,tc=`((?:WC+[\\/:])*)`.replace(`WC`,$s),nc=`(WCOD+)?`.replace(`WCOD`,ec),rc=`(?:\\.(WC+)(?:\\[(.+)\\])?)?`.replace(`WC`,$s),ic=`\\.(WC+)(?:\\[(.+)\\])?`.replace(`WC`,$s),ac=RegExp(`^`+tc+nc+rc+ic+`$`),oc=[`material`,`materials`,`bones`,`map`],sc=class{constructor(e,t,n){let r=n||cc.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},cc=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(Qs,``)}static parseTrackName(e){let t=ac.exec(e);if(t===null)throw Error(`THREE.PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);oc.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`THREE.PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){F(`PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){I(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){I(`PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){I(`PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){I(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){I(`PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){I(`PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){I(`PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;I(`PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?s=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(s=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){I(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){I(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};cc.Composite=sc,cc.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},cc.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},cc.prototype.GetterByBindingType=[cc.prototype._getValue_direct,cc.prototype._getValue_array,cc.prototype._getValue_arrayElement,cc.prototype._getValue_toArray],cc.prototype.SetterByBindingTypeAndVersioning=[[cc.prototype._setValue_direct,cc.prototype._setValue_direct_setNeedsUpdate,cc.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[cc.prototype._setValue_array,cc.prototype._setValue_array_setNeedsUpdate,cc.prototype._setValue_array_setMatrixWorldNeedsUpdate],[cc.prototype._setValue_arrayElement,cc.prototype._setValue_arrayElement_setNeedsUpdate,cc.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[cc.prototype._setValue_fromArray,cc.prototype._setValue_fromArray_setNeedsUpdate,cc.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var lc=new un,uc=class{constructor(e,t,n=0,r=1/0){this.ray=new gi(e,t),this.near=n,this.far=r,this.camera=null,this.layers=new xn,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):I(`Raycaster: Unsupported camera type: `+t.type)}setFromXRController(e){return lc.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(lc),this}intersectObject(e,t=!0,n=[]){return fc(e,this,n,t),n.sort(dc),n}intersectObjects(e,t=!0,n=[]){for(let r=0,i=e.length;r<i;r++)fc(e[r],this,n,t);return n.sort(dc),n}};function dc(e,t){return e.distance-t.distance}function fc(e,t,n,r){let i=!0;if(e.layers.test(t.layers)&&e.raycast(t,n)===!1&&(i=!1),i===!0&&r===!0){let r=e.children;for(let e=0,i=r.length;e<i;e++)fc(r[e],t,n,!0)}}(class e{static{e.prototype.isMatrix2=!0}constructor(e,t,n,r){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,r)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,r){let i=this.elements;return i[0]=e,i[2]=t,i[1]=n,i[3]=r,this}});function pc(e,t,n,r){let i=mc(r);switch(n){case re:return e*t;case se:return e*t/i.components*i.byteLength;case ce:return e*t/i.components*i.byteLength;case le:return e*t*2/i.components*i.byteLength;case ue:return e*t*2/i.components*i.byteLength;case k:return e*t*3/i.components*i.byteLength;case ie:return e*t*4/i.components*i.byteLength;case de:return e*t*4/i.components*i.byteLength;case fe:case pe:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case A:case me:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case ge:case ve:return Math.max(e,16)*Math.max(t,8)/4;case he:case _e:return Math.max(e,8)*Math.max(t,8)/2;case ye:case be:case Se:case Ce:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case xe:case we:case Te:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case Ee:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case De:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case Oe:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case ke:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case Ae:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case je:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case Me:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case Ne:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case Pe:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case Fe:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case Ie:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case Le:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case j:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case Re:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case ze:case Be:case M:return Math.ceil(e/4)*Math.ceil(t/4)*16;case Ve:case N:return Math.ceil(e/4)*Math.ceil(t/4)*8;case P:case He:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function mc(e){switch(e){case y:case b:return{byteLength:1,components:1};case S:case x:case E:return{byteLength:2,components:1};case D:case ee:return{byteLength:2,components:4};case w:case C:case T:return{byteLength:4,components:1};case O:case ne:return{byteLength:4,components:3}}throw Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`185`}})),typeof window<`u`&&(window.__THREE__?F(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`185`);function hc(){let e=null,t=!1,n=null,r=null;function i(t,a){n(t,a),r=e.requestAnimationFrame(i)}return{start:function(){t!==!0&&n!==null&&e!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function gc(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var G={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},K={common:{diffuse:{value:new H(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new B},alphaMap:{value:null},alphaMapTransform:{value:new B},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new B}},envmap:{envMap:{value:null},envMapRotation:{value:new B},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new B}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new B}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new B},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new B},normalScale:{value:new R(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new B},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new B}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new B}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new B}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new H(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new z},probesMax:{value:new z},probesResolution:{value:new z}},points:{diffuse:{value:new H(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new B},alphaTest:{value:0},uvTransform:{value:new B}},sprite:{diffuse:{value:new H(16777215)},opacity:{value:1},center:{value:new R(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new B},alphaMap:{value:null},alphaMapTransform:{value:new B},alphaTest:{value:0}}},_c={basic:{uniforms:Jo([K.common,K.specularmap,K.envmap,K.aomap,K.lightmap,K.fog]),vertexShader:G.meshbasic_vert,fragmentShader:G.meshbasic_frag},lambert:{uniforms:Jo([K.common,K.specularmap,K.envmap,K.aomap,K.lightmap,K.emissivemap,K.bumpmap,K.normalmap,K.displacementmap,K.fog,K.lights,{emissive:{value:new H(0)},envMapIntensity:{value:1}}]),vertexShader:G.meshlambert_vert,fragmentShader:G.meshlambert_frag},phong:{uniforms:Jo([K.common,K.specularmap,K.envmap,K.aomap,K.lightmap,K.emissivemap,K.bumpmap,K.normalmap,K.displacementmap,K.fog,K.lights,{emissive:{value:new H(0)},specular:{value:new H(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:G.meshphong_vert,fragmentShader:G.meshphong_frag},standard:{uniforms:Jo([K.common,K.envmap,K.aomap,K.lightmap,K.emissivemap,K.bumpmap,K.normalmap,K.displacementmap,K.roughnessmap,K.metalnessmap,K.fog,K.lights,{emissive:{value:new H(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:G.meshphysical_vert,fragmentShader:G.meshphysical_frag},toon:{uniforms:Jo([K.common,K.aomap,K.lightmap,K.emissivemap,K.bumpmap,K.normalmap,K.displacementmap,K.gradientmap,K.fog,K.lights,{emissive:{value:new H(0)}}]),vertexShader:G.meshtoon_vert,fragmentShader:G.meshtoon_frag},matcap:{uniforms:Jo([K.common,K.bumpmap,K.normalmap,K.displacementmap,K.fog,{matcap:{value:null}}]),vertexShader:G.meshmatcap_vert,fragmentShader:G.meshmatcap_frag},points:{uniforms:Jo([K.points,K.fog]),vertexShader:G.points_vert,fragmentShader:G.points_frag},dashed:{uniforms:Jo([K.common,K.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:G.linedashed_vert,fragmentShader:G.linedashed_frag},depth:{uniforms:Jo([K.common,K.displacementmap]),vertexShader:G.depth_vert,fragmentShader:G.depth_frag},normal:{uniforms:Jo([K.common,K.bumpmap,K.normalmap,K.displacementmap,{opacity:{value:1}}]),vertexShader:G.meshnormal_vert,fragmentShader:G.meshnormal_frag},sprite:{uniforms:Jo([K.sprite,K.fog]),vertexShader:G.sprite_vert,fragmentShader:G.sprite_frag},background:{uniforms:{uvTransform:{value:new B},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:G.background_vert,fragmentShader:G.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new B}},vertexShader:G.backgroundCube_vert,fragmentShader:G.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:G.cube_vert,fragmentShader:G.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:G.equirect_vert,fragmentShader:G.equirect_frag},distance:{uniforms:Jo([K.common,K.displacementmap,{referencePosition:{value:new z},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:G.distance_vert,fragmentShader:G.distance_frag},shadow:{uniforms:Jo([K.lights,K.fog,{color:{value:new H(0)},opacity:{value:1}}]),vertexShader:G.shadow_vert,fragmentShader:G.shadow_frag}};_c.physical={uniforms:Jo([_c.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new B},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new B},clearcoatNormalScale:{value:new R(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new B},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new B},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new B},sheen:{value:0},sheenColor:{value:new H(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new B},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new B},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new B},transmissionSamplerSize:{value:new R},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new B},attenuationDistance:{value:0},attenuationColor:{value:new H(0)},specularColor:{value:new H(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new B},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new B},anisotropyVector:{value:new R},anisotropyMap:{value:null},anisotropyMapTransform:{value:new B}}]),vertexShader:G.meshphysical_vert,fragmentShader:G.meshphysical_frag};var vc={r:0,b:0,g:0},yc=new un,bc=new B;bc.set(-1,0,0,0,1,0,0,0,1);function xc(e,t,n,r,i,a){let o=new H(0),s=i===!0?0:1,c,l,u=null,d=0,f=null;function p(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function m(t){let r=!1,i=p(t);i===null?g(o,s):i&&i.isColor&&(g(i,1),r=!0);let c=e.xr.getEnvironmentBlendMode();c===`additive`?n.buffers.color.setClear(0,0,0,1,a):c===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function h(t,n){let i=p(n);i&&(i.isCubeTexture||i.mapping===306)?(l===void 0&&(l=new U(new ba(1,1,1),new ts({name:`BackgroundCubeMaterial`,uniforms:qo(_c.backgroundCube.uniforms),vertexShader:_c.backgroundCube.vertexShader,fragmentShader:_c.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),l.geometry.deleteAttribute(`uv`),l.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(l)),l.material.uniforms.envMap.value=i,l.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(yc.makeRotationFromEuler(n.backgroundRotation)).transpose(),i.isCubeTexture&&i.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(bc),l.material.toneMapped=V.getTransfer(i.colorSpace)!==et,(u!==i||d!==i.version||f!==e.toneMapping)&&(l.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null)):i&&i.isTexture&&(c===void 0&&(c=new U(new Ho(2,2),new ts({name:`BackgroundMaterial`,uniforms:qo(_c.background.uniforms),vertexShader:_c.background.vertexShader,fragmentShader:_c.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute(`normal`),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=i,c.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,c.material.toneMapped=V.getTransfer(i.colorSpace)!==et,i.matrixAutoUpdate===!0&&i.updateMatrix(),c.material.uniforms.uvTransform.value.copy(i.matrix),(u!==i||d!==i.version||f!==e.toneMapping)&&(c.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),c.layers.enableAll(),t.unshift(c,c.geometry,c.material,0,0,null))}function g(t,r){t.getRGB(vc,Zo(e)),n.buffers.color.setClear(vc.r,vc.g,vc.b,r,a)}function _(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(e,t=1){o.set(e),s=t,g(o,s)},getClearAlpha:function(){return s},setClearAlpha:function(e){s=e,g(o,s)},render:m,addToRenderList:h,dispose:_}}function Sc(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function Cc(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s}function wc(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return!(t!==1023&&r.convert(t)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&n!==1015&&!i)}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(F(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`);n.reversedDepthBuffer===!0&&f===!1&&F(`WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.`);let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function Tc(e){let t=this,n=null,r=0,i=!1,a=!1,o=new Wi,s=new B,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var Ec=4,Dc=[.125,.215,.35,.446,.526,.582],Oc=20,kc=256,Ac=new Us,jc=new H,Mc=null,Nc=0,Pc=0,Fc=!1,Ic=new z,Lc=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=Ic}=i;Mc=this._renderer.getRenderTarget(),Nc=this._renderer.getActiveCubeFace(),Pc=this._renderer.getActiveMipmapLevel(),Fc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Wc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Uc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Mc,Nc,Pc),this._renderer.xr.enabled=Fc,e.scissorTest=!1,Bc(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Mc=this._renderer.getRenderTarget(),Nc=this._renderer.getActiveCubeFace(),Pc=this._renderer.getActiveMipmapLevel(),Fc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:g,minFilter:g,generateMipmaps:!1,type:E,format:ie,colorSpace:Qe,depthBuffer:!1},r=zc(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=zc(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Rc(r)),this._blurMaterial=Hc(r,e,t),this._ggxMaterial=Vc(r,e,t)}return r}_compileMaterial(e){let t=new U(new Vr,e);this._renderer.compile(t,Ac)}_sceneToCubeUV(e,t,n,r,i){let a=new Bs(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(jc),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new U(new ba,new _i({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(jc),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;Bc(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=Wc()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Uc());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;Bc(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,Ac)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(0+c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-Ec?n-d+Ec:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,Bc(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,Ac),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,Bc(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,Ac)}_blur(e,t,n,r,i){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,r,`latitudinal`,i),this._halfBlur(a,e,n,n,r,`longitudinal`,i)}_halfBlur(e,t,n,r,i,a,o){let s=this._renderer,c=this._blurMaterial;a!==`latitudinal`&&a!==`longitudinal`&&I(`blur direction must be either latitudinal or longitudinal!`);let l=this._lodMeshes[r];l.material=c;let u=c.uniforms,d=this._sizeLods[n]-1,f=isFinite(i)?Math.PI/(2*d):2*Math.PI/(2*Oc-1),p=i/f,m=isFinite(i)?1+Math.floor(3*p):Oc;m>Oc&&F(`sigmaRadians, ${i}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Oc}`);let h=[],g=0;for(let e=0;e<Oc;++e){let t=e/p,n=Math.exp(-t*t/2);h.push(n),e===0?g+=n:e<m&&(g+=2*n)}for(let e=0;e<h.length;e++)h[e]=h[e]/g;u.envMap.value=e.texture,u.samples.value=m,u.weights.value=h,u.latitudinal.value=a===`latitudinal`,o&&(u.poleAxis.value=o);let{_lodMax:_}=this;u.dTheta.value=f,u.mipInt.value=_-n;let v=this._sizeLods[r];Bc(t,3*v*(r>_-Ec?r-_+Ec:0),4*(this._cubeSize-v),3*v,2*v),s.setRenderTarget(t),s.render(l,Ac)}};function Rc(e){let t=[],n=[],r=[],i=e,a=e-Ec+1+Dc.length;for(let o=0;o<a;o++){let a=2**i;t.push(a);let s=1/a;o>e-Ec?s=Dc[o-e+Ec-1]:o===0&&(s=0),n.push(s);let c=1/(a-2),l=-c,u=1+c,d=[l,l,u,l,u,u,l,l,u,u,l,u],f=new Float32Array(108),p=new Float32Array(72),m=new Float32Array(36);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];f.set(r,18*e),p.set(d,12*e);let i=[e,e,e,e,e,e];m.set(i,6*e)}let h=new Vr;h.setAttribute(`position`,new Er(f,3)),h.setAttribute(`uv`,new Er(p,2)),h.setAttribute(`faceIndex`,new Er(m,1)),r.push(new U(h,null)),i>Ec&&i--}return{lodMeshes:r,sizeLods:t,sigmas:n}}function zc(e,t,n){let r=new sn(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function Bc(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function Vc(e,t,n){return new ts({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:kc,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Gc(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Hc(e,t,n){let r=new Float32Array(Oc),i=new z(0,1,0);return new ts({name:`SphericalGaussianBlur`,defines:{n:Oc,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Gc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Uc(){return new ts({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:Gc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Wc(){return new ts({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Gc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Gc(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}var Kc=class extends sn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new ha(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new ba(5,5,5),i=new ts({name:`CubemapFromEquirect`,uniforms:qo(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new U(r,i),o=t.minFilter;return t.minFilter===1008&&(t.minFilter=g),new Ys(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function qc(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304)if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}else{let r=n.image;if(r&&r.height>0){let i=new Kc(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}else return null}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new Lc(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new Lc(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function Jc(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&dt(`WebGLRenderer: `+e+` extension not supported.`),t}}}function Yc(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0?t:(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++,t)}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?Or:Dr)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function Xc(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function Zc(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:I(`WebGLInfo: Unknown draw mode:`,r);break}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function Qc(e,t,n){let r=new WeakMap,i=new an;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let h=new Float32Array(p*m*4*u),g=new cn(h,p,m,u);g.type=T,g.needsUpdate=!0;let _=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*_;e===!0&&(i.fromBufferAttribute(r,t),h[d+s+0]=i.x,h[d+s+1]=i.y,h[d+s+2]=i.z,h[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),h[d+s+4]=i.x,h[d+s+5]=i.y,h[d+s+6]=i.z,h[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),h[d+s+8]=i.x,h[d+s+9]=i.y,h[d+s+10]=i.z,h[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:g,size:new R(p,m)},r.set(o,d);function v(){g.dispose(),r.delete(o),o.removeEventListener(`dispose`,v)}o.addEventListener(`dispose`,v)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function $c(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var el={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function tl(e,t,n,r,i,a){let o=new sn(t,n,{type:e,depthBuffer:i,stencilBuffer:a,samples:r?4:0,depthTexture:i?new _a(t,n):void 0}),s=new sn(t,n,{type:E,depthBuffer:!1,stencilBuffer:!1}),c=new Vr;c.setAttribute(`position`,new kr([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute(`uv`,new kr([0,2,0,0,2,0],2));let l=new ns({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),u=new U(c,l),d=new Us(-1,1,1,-1,0,1),f=null,p=null,m=!1,h,g=null,_=[],v=!1;this.setSize=function(e,t){o.setSize(e,t),s.setSize(e,t);for(let n=0;n<_.length;n++){let r=_[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){_=e,v=_.length>0&&_[0].isRenderPass===!0;let t=o.width,n=o.height;for(let e=0;e<_.length;e++){let r=_[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(m||e.toneMapping===0&&_.length===0)return!1;if(g=t,t!==null){let e=t.width,n=t.height;(o.width!==e||o.height!==n)&&this.setSize(e,n)}return v===!1&&e.setRenderTarget(o),h=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return v},this.end=function(e,t){e.toneMapping=h,m=!0;let n=o,r=s;for(let i=0;i<_.length;i++){let a=_[i];if(a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1)){let e=n;n=r,r=e}}if(f!==e.outputColorSpace||p!==e.toneMapping){f=e.outputColorSpace,p=e.toneMapping,l.defines={},V.getTransfer(f)===`srgb`&&(l.defines.SRGB_TRANSFER=``);let t=el[p];t&&(l.defines[t]=``),l.needsUpdate=!0}l.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(g),e.render(u,d),g=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){o.depthTexture&&o.depthTexture.dispose(),o.dispose(),s.dispose(),c.dispose(),l.dispose()}}var nl=new rn,rl=new _a(1,1),il=new cn,al=new ln,ol=new ha,sl=[],cl=[],ll=new Float32Array(16),ul=new Float32Array(9),dl=new Float32Array(4);function fl(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=sl[i];if(a===void 0&&(a=new Float32Array(i),sl[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function pl(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function ml(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function hl(e,t){let n=cl[t];n===void 0&&(n=new Int32Array(t),cl[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function gl(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function _l(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(pl(n,t))return;e.uniform2fv(this.addr,t),ml(n,t)}}function vl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(pl(n,t))return;e.uniform3fv(this.addr,t),ml(n,t)}}function yl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(pl(n,t))return;e.uniform4fv(this.addr,t),ml(n,t)}}function bl(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(pl(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),ml(n,t)}else{if(pl(n,r))return;dl.set(r),e.uniformMatrix2fv(this.addr,!1,dl),ml(n,r)}}function xl(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(pl(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),ml(n,t)}else{if(pl(n,r))return;ul.set(r),e.uniformMatrix3fv(this.addr,!1,ul),ml(n,r)}}function Sl(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(pl(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),ml(n,t)}else{if(pl(n,r))return;ll.set(r),e.uniformMatrix4fv(this.addr,!1,ll),ml(n,r)}}function Cl(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function wl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(pl(n,t))return;e.uniform2iv(this.addr,t),ml(n,t)}}function Tl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(pl(n,t))return;e.uniform3iv(this.addr,t),ml(n,t)}}function El(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(pl(n,t))return;e.uniform4iv(this.addr,t),ml(n,t)}}function Dl(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function Ol(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(pl(n,t))return;e.uniform2uiv(this.addr,t),ml(n,t)}}function kl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(pl(n,t))return;e.uniform3uiv(this.addr,t),ml(n,t)}}function Al(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(pl(n,t))return;e.uniform4uiv(this.addr,t),ml(n,t)}}function jl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(rl.compareFunction=n.isReversedDepthBuffer()?518:515,a=rl):a=nl,n.setTexture2D(t||a,i)}function Ml(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||al,i)}function Nl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||ol,i)}function Pl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||il,i)}function Fl(e){switch(e){case 5126:return gl;case 35664:return _l;case 35665:return vl;case 35666:return yl;case 35674:return bl;case 35675:return xl;case 35676:return Sl;case 5124:case 35670:return Cl;case 35667:case 35671:return wl;case 35668:case 35672:return Tl;case 35669:case 35673:return El;case 5125:return Dl;case 36294:return Ol;case 36295:return kl;case 36296:return Al;case 35678:case 36198:case 36298:case 36306:case 35682:return jl;case 35679:case 36299:case 36307:return Ml;case 35680:case 36300:case 36308:case 36293:return Nl;case 36289:case 36303:case 36311:case 36292:return Pl}}function Il(e,t){e.uniform1fv(this.addr,t)}function Ll(e,t){let n=fl(t,this.size,2);e.uniform2fv(this.addr,n)}function Rl(e,t){let n=fl(t,this.size,3);e.uniform3fv(this.addr,n)}function zl(e,t){let n=fl(t,this.size,4);e.uniform4fv(this.addr,n)}function Bl(e,t){let n=fl(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Vl(e,t){let n=fl(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function Hl(e,t){let n=fl(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function Ul(e,t){e.uniform1iv(this.addr,t)}function Wl(e,t){e.uniform2iv(this.addr,t)}function Gl(e,t){e.uniform3iv(this.addr,t)}function Kl(e,t){e.uniform4iv(this.addr,t)}function ql(e,t){e.uniform1uiv(this.addr,t)}function Jl(e,t){e.uniform2uiv(this.addr,t)}function Yl(e,t){e.uniform3uiv(this.addr,t)}function Xl(e,t){e.uniform4uiv(this.addr,t)}function Zl(e,t,n){let r=this.cache,i=t.length,a=hl(n,i);pl(r,a)||(e.uniform1iv(this.addr,a),ml(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?rl:nl;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function Ql(e,t,n){let r=this.cache,i=t.length,a=hl(n,i);pl(r,a)||(e.uniform1iv(this.addr,a),ml(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||al,a[e])}function $l(e,t,n){let r=this.cache,i=t.length,a=hl(n,i);pl(r,a)||(e.uniform1iv(this.addr,a),ml(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||ol,a[e])}function eu(e,t,n){let r=this.cache,i=t.length,a=hl(n,i);pl(r,a)||(e.uniform1iv(this.addr,a),ml(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||il,a[e])}function tu(e){switch(e){case 5126:return Il;case 35664:return Ll;case 35665:return Rl;case 35666:return zl;case 35674:return Bl;case 35675:return Vl;case 35676:return Hl;case 5124:case 35670:return Ul;case 35667:case 35671:return Wl;case 35668:case 35672:return Gl;case 35669:case 35673:return Kl;case 5125:return ql;case 36294:return Jl;case 36295:return Yl;case 36296:return Xl;case 35678:case 36198:case 36298:case 36306:case 35682:return Zl;case 35679:case 36299:case 36307:return Ql;case 35680:case 36300:case 36308:case 36293:return $l;case 36289:case 36303:case 36311:case 36292:return eu}}var nu=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Fl(t.type)}},ru=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=tu(t.type)}},iu=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},au=/(\w+)(\])?(\[|\.)?/g;function ou(e,t){e.seq.push(t),e.map[t.id]=t}function su(e,t,n){let r=e.name,i=r.length;for(au.lastIndex=0;;){let a=au.exec(r),o=au.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){ou(n,l===void 0?new nu(s,e,t):new ru(s,e,t));break}else{let e=n.map[s];e===void 0&&(e=new iu(s),ou(n,e)),n=e}}}var cu=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);su(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function lu(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var uu=37297,du=0;function fu(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var pu=new B;function mu(e){V._getMatrix(pu,V.workingColorSpace,e);let t=`mat3( ${pu.elements.map(e=>e.toFixed(4))} )`;switch(V.getTransfer(e)){case $e:return[t,`LinearTransferOETF`];case et:return[t,`sRGBTransferOETF`];default:return F(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function hu(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+fu(e.getShaderSource(t),r)}else return i}function gu(e,t){let n=mu(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var _u={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function vu(e,t){let n=_u[t];return n===void 0?(F(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var yu=new z;function bu(){return V.getLuminanceCoefficients(yu),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${yu.x.toFixed(4)}, ${yu.y.toFixed(4)}, ${yu.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function xu(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(wu).join(`
`)}function Su(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function Cu(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function wu(e){return e!==``}function Tu(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Eu(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Du=/^[ \t]*#include +<([\w\d./]+)>/gm;function Ou(e){return e.replace(Du,Au)}var ku=new Map;function Au(e,t){let n=G[t];if(n===void 0){let e=ku.get(t);if(e!==void 0)n=G[e],F(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`THREE.WebGLProgram: Can not resolve #include <`+t+`>`)}return Ou(n)}var ju=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Mu(e){return e.replace(ju,Nu)}function Nu(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function Pu(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var Fu={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function Iu(e){return Fu[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var Lu={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function Ru(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:Lu[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var zu={302:`ENVMAP_MODE_REFRACTION`};function Bu(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:zu[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var Vu={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function Hu(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:Vu[e.combine]||`ENVMAP_BLENDING_NONE`}function Uu(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function Wu(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=Iu(n),l=Ru(n),u=Bu(n),d=Hu(n),f=Uu(n),p=xu(n),m=Su(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(wu).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(wu).join(`
`),_.length>0&&(_+=`
`)):(g=[Pu(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexNormals?`#define HAS_NORMAL`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(wu).join(`
`),_=[Pu(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.packedNormalMap?`#define USE_PACKED_NORMALMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.numLightProbeGrids>0?`#define USE_LIGHT_PROBES_GRID`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:G.tonemapping_pars_fragment,n.toneMapping===0?``:vu(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,G.colorspace_pars_fragment,gu(`linearToOutputTexel`,n.outputColorSpace),bu(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(wu).join(`
`)),o=Ou(o),o=Tu(o,n),o=Eu(o,n),s=Ou(s),s=Tu(s,n),s=Eu(s,n),o=Mu(o),s=Mu(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=lu(i,i.VERTEX_SHADER,y),S=lu(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.hasPositionAttribute===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1)if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=hu(i,x,`vertex`),n=hu(i,S,`fragment`);I(`WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}else o===``?(s===``||c===``)&&(u=!1):F(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new cu(i,h),T=Cu(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,uu)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=du++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var Gu=0,Ku=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(n)===!1&&(r.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new qu(e),t.set(e,n)),n}},qu=class{constructor(e){this.id=Gu++,this.code=e,this.usedTimes=0}};function Ju(e){return e===1030||e===37490||e===36285}function Yu(e,t,n,r,i,a){let o=new xn,s=new Ku,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h,g){let _=u.fog,v=h.geometry,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,b=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,x=t.get(i.envMap||y,b),S=x&&x.mapping===306?x.image.height:null,C=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&F(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let w=v.morphAttributes.position||v.morphAttributes.normal||v.morphAttributes.color,T=w===void 0?0:w.length,E=0;v.morphAttributes.position!==void 0&&(E=1),v.morphAttributes.normal!==void 0&&(E=2),v.morphAttributes.color!==void 0&&(E=3);let D,ee,te,O;if(C){let e=_c[C];D=e.vertexShader,ee=e.fragmentShader}else{D=i.vertexShader,ee=i.fragmentShader;let e=s.getVertexShaderStage(i),t=s.getFragmentShaderStage(i);s.update(i,e,t),te=e.id,O=t.id}let ne=e.getRenderTarget(),re=e.state.buffers.depth.getReversed(),k=h.isInstancedMesh===!0,ie=h.isBatchedMesh===!0,ae=!!i.map,oe=!!i.matcap,se=!!x,ce=!!i.aoMap,le=!!i.lightMap,ue=!!i.bumpMap&&i.wireframe===!1,de=!!i.normalMap,fe=!!i.displacementMap,pe=!!i.emissiveMap,A=!!i.metalnessMap,me=!!i.roughnessMap,he=i.anisotropy>0,ge=i.clearcoat>0,_e=i.dispersion>0,ve=i.iridescence>0,ye=i.sheen>0,be=i.transmission>0,xe=he&&!!i.anisotropyMap,Se=ge&&!!i.clearcoatMap,Ce=ge&&!!i.clearcoatNormalMap,we=ge&&!!i.clearcoatRoughnessMap,Te=ve&&!!i.iridescenceMap,Ee=ve&&!!i.iridescenceThicknessMap,De=ye&&!!i.sheenColorMap,Oe=ye&&!!i.sheenRoughnessMap,ke=!!i.specularMap,Ae=!!i.specularColorMap,je=!!i.specularIntensityMap,Me=be&&!!i.transmissionMap,Ne=be&&!!i.thicknessMap,Pe=!!i.gradientMap,Fe=!!i.alphaMap,Ie=i.alphaTest>0,Le=!!i.alphaHash,j=!!i.extensions,Re=0;i.toneMapped&&(ne===null||ne.isXRRenderTarget===!0)&&(Re=e.toneMapping);let ze={shaderID:C,shaderType:i.type,shaderName:i.name,vertexShader:D,fragmentShader:ee,defines:i.defines,customVertexShaderID:te,customFragmentShaderID:O,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:ie,batchingColor:ie&&h._colorsTexture!==null,instancing:k,instancingColor:k&&h.instanceColor!==null,instancingMorph:k&&h.morphTexture!==null,outputColorSpace:ne===null?e.outputColorSpace:ne.isXRRenderTarget===!0?ne.texture.colorSpace:V.workingColorSpace,alphaToCoverage:!!i.alphaToCoverage,map:ae,matcap:oe,envMap:se,envMapMode:se&&x.mapping,envMapCubeUVHeight:S,aoMap:ce,lightMap:le,bumpMap:ue,normalMap:de,displacementMap:fe,emissiveMap:pe,normalMapObjectSpace:de&&i.normalMapType===1,normalMapTangentSpace:de&&i.normalMapType===0,packedNormalMap:de&&i.normalMapType===0&&Ju(i.normalMap.format),metalnessMap:A,roughnessMap:me,anisotropy:he,anisotropyMap:xe,clearcoat:ge,clearcoatMap:Se,clearcoatNormalMap:Ce,clearcoatRoughnessMap:we,dispersion:_e,iridescence:ve,iridescenceMap:Te,iridescenceThicknessMap:Ee,sheen:ye,sheenColorMap:De,sheenRoughnessMap:Oe,specularMap:ke,specularColorMap:Ae,specularIntensityMap:je,transmission:be,transmissionMap:Me,thicknessMap:Ne,gradientMap:Pe,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:Fe,alphaTest:Ie,alphaHash:Le,combine:i.combine,mapUv:ae&&m(i.map.channel),aoMapUv:ce&&m(i.aoMap.channel),lightMapUv:le&&m(i.lightMap.channel),bumpMapUv:ue&&m(i.bumpMap.channel),normalMapUv:de&&m(i.normalMap.channel),displacementMapUv:fe&&m(i.displacementMap.channel),emissiveMapUv:pe&&m(i.emissiveMap.channel),metalnessMapUv:A&&m(i.metalnessMap.channel),roughnessMapUv:me&&m(i.roughnessMap.channel),anisotropyMapUv:xe&&m(i.anisotropyMap.channel),clearcoatMapUv:Se&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:Ce&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:we&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:Te&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:Ee&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:De&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:Oe&&m(i.sheenRoughnessMap.channel),specularMapUv:ke&&m(i.specularMap.channel),specularColorMapUv:Ae&&m(i.specularColorMap.channel),specularIntensityMapUv:je&&m(i.specularIntensityMap.channel),transmissionMapUv:Me&&m(i.transmissionMap.channel),thicknessMapUv:Ne&&m(i.thicknessMap.channel),alphaMapUv:Fe&&m(i.alphaMap.channel),vertexTangents:!!v.attributes.tangent&&(de||he),vertexNormals:!!v.attributes.normal,vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!v.attributes.color&&v.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!v.attributes.uv&&(ae||Fe),fog:!!_,useFog:i.fog===!0,fogExp2:!!_&&_.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||v.attributes.normal===void 0&&de===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:re,skinning:h.isSkinnedMesh===!0,hasPositionAttribute:v.attributes.position!==void 0,morphTargets:v.morphAttributes.position!==void 0,morphNormals:v.morphAttributes.normal!==void 0,morphColors:v.morphAttributes.color!==void 0,morphTargetsCount:T,morphTextureStride:E,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numLightProbeGrids:g.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:Re,decodeVideoTexture:ae&&i.map.isVideoTexture===!0&&V.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:pe&&i.emissiveMap.isVideoTexture===!0&&V.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:j&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(j&&i.extensions.multiDraw===!0||ie)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return ze.vertexUv1s=c.has(1),ze.vertexUv2s=c.has(2),ze.vertexUv3s=c.has(3),c.clear(),ze}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),t.packedNormalMap&&o.enable(22),t.vertexNormals&&o.enable(23),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),t.numLightProbeGrids>0&&o.enable(22),t.hasPositionAttribute&&o.enable(23),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=_c[t];n=Qo.clone(e.uniforms)}else n=e.uniforms;return n}function b(t,n){let r=u.get(n);return r===void 0?(r=new Wu(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function x(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function S(e){s.remove(e)}function C(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:b,releaseProgram:x,releaseShaderCache:S,programs:l,dispose:C}}function Xu(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function Zu(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Qu(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function $u(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.push(u):a.transparent===!0?i.push(u):n.push(u)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t,a){n.length>1&&n.sort(e||Zu),r.length>1&&r.sort(t||Qu),i.length>1&&i.sort(t||Qu),a&&(n.reverse(),r.reverse(),i.reverse())}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function ed(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new $u,e.set(t,[i])):n>=r.length?(i=new $u,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function td(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={direction:new z,color:new H};break;case`SpotLight`:n={position:new z,direction:new z,color:new H,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new z,color:new H,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new z,skyColor:new H,groundColor:new H};break;case`RectAreaLight`:n={color:new H,position:new z,halfWidth:new z,halfHeight:new z};break}return e[t.id]=n,n}}}function nd(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new R};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new R};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new R,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[t.id]=n,n}}}var rd=0;function id(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function ad(e){let t=new td,n=nd(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new z);let i=new z,a=new un,o=new un;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0;i.sort(id);for(let e=0,y=i.length;e<y;e++){let y=i[e],b=y.color,x=y.intensity,S=y.distance,C=null;if(y.shadow&&y.shadow.map&&(C=y.shadow.map.texture.format===1030?y.shadow.map.texture:y.shadow.map.depthTexture||y.shadow.map.texture),y.isAmbientLight)a+=b.r*x,o+=b.g*x,s+=b.b*x;else if(y.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(y.sh.coefficients[e],x);v++}else if(y.isDirectionalLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[c]=t,r.directionalShadowMap[c]=C,r.directionalShadowMatrix[c]=y.shadow.matrix,p++}r.directional[c]=e,c++}else if(y.isSpotLight){let e=t.get(y);e.position.setFromMatrixPosition(y.matrixWorld),e.color.copy(b).multiplyScalar(x),e.distance=S,e.coneCos=Math.cos(y.angle),e.penumbraCos=Math.cos(y.angle*(1-y.penumbra)),e.decay=y.decay,r.spot[u]=e;let i=y.shadow;if(y.map&&(r.spotLightMap[g]=y.map,g++,i.updateMatrices(y),y.castShadow&&_++),r.spotLightMatrix[u]=i.matrix,y.castShadow){let e=n.get(y);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[u]=e,r.spotShadowMap[u]=C,h++}u++}else if(y.isRectAreaLight){let e=t.get(y);e.color.copy(b).multiplyScalar(x),e.halfWidth.set(y.width*.5,0,0),e.halfHeight.set(0,y.height*.5,0),r.rectArea[d]=e,d++}else if(y.isPointLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),e.distance=y.distance,e.decay=y.decay,y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[l]=t,r.pointShadowMap[l]=C,r.pointShadowMatrix[l]=y.shadow.matrix,m++}r.point[l]=e,l++}else if(y.isHemisphereLight){let e=t.get(y);e.skyColor.copy(y.color).multiplyScalar(x),e.groundColor.copy(y.groundColor).multiplyScalar(x),r.hemi[f]=e,f++}}d>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=K.LTC_FLOAT_1,r.rectAreaLTC2=K.LTC_FLOAT_2):(r.rectAreaLTC1=K.LTC_HALF_1,r.rectAreaLTC2=K.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let y=r.hash;(y.directionalLength!==c||y.pointLength!==l||y.spotLength!==u||y.rectAreaLength!==d||y.hemiLength!==f||y.numDirectionalShadows!==p||y.numPointShadows!==m||y.numSpotShadows!==h||y.numSpotMaps!==g||y.numLightProbes!==v)&&(r.directional.length=c,r.spot.length=u,r.rectArea.length=d,r.point.length=l,r.hemi.length=f,r.directionalShadow.length=p,r.directionalShadowMap.length=p,r.pointShadow.length=m,r.pointShadowMap.length=m,r.spotShadow.length=h,r.spotShadowMap.length=h,r.directionalShadowMatrix.length=p,r.pointShadowMatrix.length=m,r.spotLightMatrix.length=h+g-_,r.spotLightMap.length=g,r.numSpotLightShadowsWithMaps=_,r.numLightProbes=v,y.directionalLength=c,y.pointLength=l,y.spotLength=u,y.rectAreaLength=d,y.hemiLength=f,y.numDirectionalShadows=p,y.numPointShadows=m,y.numSpotShadows=h,y.numSpotMaps=g,y.numLightProbes=v,r.version=rd++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=t.matrixWorldInverse;for(let t=0,f=e.length;t<f;t++){let f=e[t];if(f.isDirectionalLight){let e=r.directional[n];e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),n++}else if(f.isSpotLight){let e=r.spot[c];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),c++}else if(f.isRectAreaLight){let e=r.rectArea[l];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),o.identity(),a.copy(f.matrixWorld),a.premultiply(d),o.extractRotation(a),e.halfWidth.set(f.width*.5,0,0),e.halfHeight.set(0,f.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),l++}else if(f.isPointLight){let e=r.point[s];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),s++}else if(f.isHemisphereLight){let e=r.hemi[u];e.direction.setFromMatrixPosition(f.matrixWorld),e.direction.transformDirection(d),u++}}}return{setup:s,setupView:c,state:r}}function od(e){let t=new ad(e),n=[],r=[],i=[];function a(e){d.camera=e,n.length=0,r.length=0,i.length=0}function o(e){n.push(e)}function s(e){r.push(e)}function c(e){i.push(e)}function l(){t.setup(n)}function u(e){t.setupView(n,e)}let d={lightsArray:n,shadowsArray:r,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:s,pushLightProbeGrid:c}}function sd(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new od(e),t.set(n,[a])):r>=i.length?(a=new od(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var cd=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,ld=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,ud=[new z(1,0,0),new z(-1,0,0),new z(0,1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1)],dd=[new z(0,-1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1),new z(0,-1,0),new z(0,-1,0)],fd=new un,pd=new z,md=new z;function hd(e,t,n){let r=new Ji,i=new R,a=new R,o=new an,s=new is,c=new as,l={},u=n.maxTextureSize,d={0:1,1:0,2:2},f=new ts({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new R},radius:{value:4}},vertexShader:cd,fragmentShader:ld}),m=f.clone();m.defines.HORIZONTAL_PASS=1;let h=new Vr;h.setAttribute(`position`,new Er(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new U(h,f),v=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let y=this.type;this.render=function(t,n,s){if(v.enabled===!1||v.autoUpdate===!1&&v.needsUpdate===!1||t.length===0)return;this.type===2&&(F(`WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`),this.type=1);let c=e.getRenderTarget(),l=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),f=e.state;f.setBlending(0),f.buffers.depth.getReversed()===!0?f.buffers.color.setClear(0,0,0,0):f.buffers.color.setClear(1,1,1,1),f.buffers.depth.setTest(!0),f.setScissorTest(!1);let m=y!==this.type;m&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let c=0,l=t.length;c<l;c++){let l=t[c],d=l.shadow;if(d===void 0){F(`WebGLShadowMap:`,l,`has no shadow.`);continue}if(d.autoUpdate===!1&&d.needsUpdate===!1)continue;i.copy(d.mapSize);let h=d.getFrameExtents();i.multiply(h),a.copy(d.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(a.x=Math.floor(u/h.x),i.x=a.x*h.x,d.mapSize.x=a.x),i.y>u&&(a.y=Math.floor(u/h.y),i.y=a.y*h.y,d.mapSize.y=a.y));let _=e.state.buffers.depth.getReversed();if(d.camera._reversedDepth=_,d.map===null||m===!0){if(d.map!==null&&(d.map.depthTexture!==null&&(d.map.depthTexture.dispose(),d.map.depthTexture=null),d.map.dispose()),this.type===3){if(l.isPointLight){F(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}d.map=new sn(i.x,i.y,{format:le,type:E,minFilter:g,magFilter:g,generateMipmaps:!1}),d.map.texture.name=l.name+`.shadowMap`,d.map.depthTexture=new _a(i.x,i.y,T),d.map.depthTexture.name=l.name+`.shadowMapDepth`,d.map.depthTexture.format=ae,d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=p,d.map.depthTexture.magFilter=p}else l.isPointLight?(d.map=new Kc(i.x),d.map.depthTexture=new va(i.x,w)):(d.map=new sn(i.x,i.y),d.map.depthTexture=new _a(i.x,i.y,w)),d.map.depthTexture.name=l.name+`.shadowMap`,d.map.depthTexture.format=ae,this.type===1?(d.map.depthTexture.compareFunction=_?518:515,d.map.depthTexture.minFilter=g,d.map.depthTexture.magFilter=g):(d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=p,d.map.depthTexture.magFilter=p);d.camera.updateProjectionMatrix()}let v=d.map.isWebGLCubeRenderTarget?6:1;for(let t=0;t<v;t++){if(d.map.isWebGLCubeRenderTarget)e.setRenderTarget(d.map,t),e.clear();else{t===0&&(e.setRenderTarget(d.map),e.clear());let n=d.getViewport(t);o.set(a.x*n.x,a.y*n.y,a.x*n.z,a.y*n.w),f.viewport(o)}if(l.isPointLight){let e=d.camera,n=d.matrix,r=l.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),pd.setFromMatrixPosition(l.matrixWorld),e.position.copy(pd),md.copy(e.position),md.add(ud[t]),e.up.copy(dd[t]),e.lookAt(md),e.updateMatrixWorld(),n.makeTranslation(-pd.x,-pd.y,-pd.z),fd.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),d._frustum.setFromProjectionMatrix(fd,e.coordinateSystem,e.reversedDepth)}else d.updateMatrices(l);r=d.getFrustum(),S(n,s,d.camera,l,this.type)}d.isPointLightShadow!==!0&&this.type===3&&b(d,s),d.needsUpdate=!1}y=this.type,v.needsUpdate=!1,e.setRenderTarget(c,l,d)};function b(n,r){let a=t.update(_);f.defines.VSM_SAMPLES!==n.blurSamples&&(f.defines.VSM_SAMPLES=n.blurSamples,m.defines.VSM_SAMPLES=n.blurSamples,f.needsUpdate=!0,m.needsUpdate=!0),n.mapPass===null&&(n.mapPass=new sn(i.x,i.y,{format:le,type:E})),f.uniforms.shadow_pass.value=n.map.depthTexture,f.uniforms.resolution.value=n.mapSize,f.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,a,f,_,null),m.uniforms.shadow_pass.value=n.mapPass.texture,m.uniforms.resolution.value=n.mapSize,m.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,a,m,_,null)}function x(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?c:s,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=l[e];r===void 0&&(r={},l[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,C)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?d[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function S(n,i,a,o,s){if(n.visible===!1)return;if(n.layers.test(i.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||r.intersectsObject(n))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let r=t.update(n),c=n.material;if(Array.isArray(c)){let t=r.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=x(n,d,o,s);n.onBeforeShadow(e,n,i,a,r,t,u),e.renderBufferDirect(a,null,r,t,n,u),n.onAfterShadow(e,n,i,a,r,t,u)}}}else if(c.visible){let t=x(n,c,o,s);n.onBeforeShadow(e,n,i,a,r,t,null),e.renderBufferDirect(a,null,r,t,n,null),n.onAfterShadow(e,n,i,a,r,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)S(c[e],i,a,o,s)}function C(e){e.target.removeEventListener(`dispose`,C);for(let t in l){let n=l[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function gd(e,t){function n(){let t=!1,n=new an,r=null,i=new an(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?A(e.DEPTH_TEST):me(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=pt[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?A(e.STENCIL_TEST):me(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new H(0,0,0),T=0,E=!1,D=null,ee=null,te=null,O=null,ne=null,re=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),k=!1,ie=0,ae=e.getParameter(e.VERSION);ae.indexOf(`WebGL`)===-1?ae.indexOf(`OpenGL ES`)!==-1&&(ie=parseFloat(/^OpenGL ES (\d)/.exec(ae)[1]),k=ie>=2):(ie=parseFloat(/^WebGL (\d)/.exec(ae)[1]),k=ie>=1);let oe=null,se={},ce=e.getParameter(e.SCISSOR_BOX),le=e.getParameter(e.VIEWPORT),ue=new an().fromArray(ce),de=new an().fromArray(le);function fe(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let pe={};pe[e.TEXTURE_2D]=fe(e.TEXTURE_2D,e.TEXTURE_2D,1),pe[e.TEXTURE_CUBE_MAP]=fe(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),pe[e.TEXTURE_2D_ARRAY]=fe(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),pe[e.TEXTURE_3D]=fe(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),A(e.DEPTH_TEST),o.setFunc(3),Se(!1),Ce(1),A(e.CULL_FACE),be(0);function A(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function me(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function he(t,n){return f[t]===n?!1:(e.bindFramebuffer(t,n),f[t]=n,t===e.DRAW_FRAMEBUFFER&&(f[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(f[e.DRAW_FRAMEBUFFER]=n),!0)}function ge(t,n){let r=m,i=!1;if(t){r=p.get(n),r===void 0&&(r=[],p.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function _e(t){return h===t?!1:(e.useProgram(t),h=t,!0)}let ve={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};ve[103]=e.MIN,ve[104]=e.MAX;let ye={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function be(t,n,r,i,a,o,s,c,l,u){if(t===0){g===!0&&(me(e.BLEND),g=!1);return}if(g===!1&&(A(e.BLEND),g=!0),t!==5){if(t!==_||u!==E){if((v!==100||x!==100)&&(e.blendEquation(e.FUNC_ADD),v=100,x=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:I(`WebGLState: Invalid blending: `,t);break}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:I(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:I(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:I(`WebGLState: Invalid blending: `,t);break}y=null,b=null,S=null,C=null,w.set(0,0,0),T=0,_=t,E=u}return}a||=n,o||=r,s||=i,(n!==v||a!==x)&&(e.blendEquationSeparate(ve[n],ve[a]),v=n,x=a),(r!==y||i!==b||o!==S||s!==C)&&(e.blendFuncSeparate(ye[r],ye[i],ye[o],ye[s]),y=r,b=i,S=o,C=s),(c.equals(w)===!1||l!==T)&&(e.blendColor(c.r,c.g,c.b,l),w.copy(c),T=l),_=t,E=!1}function xe(t,n){t.side===2?me(e.CULL_FACE):A(e.CULL_FACE);let r=t.side===1;n&&(r=!r),Se(r),t.blending===1&&t.transparent===!1?be(0):be(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),Te(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?A(e.SAMPLE_ALPHA_TO_COVERAGE):me(e.SAMPLE_ALPHA_TO_COVERAGE)}function Se(t){D!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),D=t)}function Ce(t){t===0?me(e.CULL_FACE):(A(e.CULL_FACE),t!==ee&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),ee=t}function we(t){t!==te&&(k&&e.lineWidth(t),te=t)}function Te(t,n,r){t?(A(e.POLYGON_OFFSET_FILL),(O!==n||ne!==r)&&(O=n,ne=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):me(e.POLYGON_OFFSET_FILL)}function Ee(t){t?A(e.SCISSOR_TEST):me(e.SCISSOR_TEST)}function De(t){t===void 0&&(t=e.TEXTURE0+re-1),oe!==t&&(e.activeTexture(t),oe=t)}function Oe(t,n,r){r===void 0&&(r=oe===null?e.TEXTURE0+re-1:oe);let i=se[r];i===void 0&&(i={type:void 0,texture:void 0},se[r]=i),(i.type!==t||i.texture!==n)&&(oe!==r&&(e.activeTexture(r),oe=r),e.bindTexture(t,n||pe[t]),i.type=t,i.texture=n)}function ke(){let t=se[oe];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function Ae(){try{e.compressedTexImage2D(...arguments)}catch(e){I(`WebGLState:`,e)}}function je(){try{e.compressedTexImage3D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Me(){try{e.texSubImage2D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Ne(){try{e.texSubImage3D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Pe(){try{e.compressedTexSubImage2D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Fe(){try{e.compressedTexSubImage3D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Ie(){try{e.texStorage2D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Le(){try{e.texStorage3D(...arguments)}catch(e){I(`WebGLState:`,e)}}function j(){try{e.texImage2D(...arguments)}catch(e){I(`WebGLState:`,e)}}function Re(){try{e.texImage3D(...arguments)}catch(e){I(`WebGLState:`,e)}}function ze(t){return d[t]===void 0?e.getParameter(t):d[t]}function Be(t,n){d[t]!==n&&(e.pixelStorei(t,n),d[t]=n)}function M(t){ue.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),ue.copy(t))}function Ve(t){de.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),de.copy(t))}function N(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function P(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function He(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},oe=null,se={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new H(0,0,0),T=0,E=!1,D=null,ee=null,te=null,O=null,ne=null,ue.set(0,0,e.canvas.width,e.canvas.height),de.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:A,disable:me,bindFramebuffer:he,drawBuffers:ge,useProgram:_e,setBlending:be,setMaterial:xe,setFlipSided:Se,setCullFace:Ce,setLineWidth:we,setPolygonOffset:Te,setScissorTest:Ee,activeTexture:De,bindTexture:Oe,unbindTexture:ke,compressedTexImage2D:Ae,compressedTexImage3D:je,texImage2D:j,texImage3D:Re,pixelStorei:Be,getParameter:ze,updateUBOMapping:N,uniformBlockBinding:P,texStorage2D:Ie,texStorage3D:Le,texSubImage2D:Me,texSubImage3D:Ne,compressedTexSubImage2D:Pe,compressedTexSubImage3D:Fe,scissor:M,viewport:Ve,reset:He}}function _d(e,t,n,r,i,a,o){let s=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,c=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),l=new R,y=new WeakMap,b=new Set,x,S=new WeakMap,C=!1;try{C=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function w(e,t){return C?new OffscreenCanvas(e,t):ot(`canvas`)}function T(e,t,n){let r=1,i=ze(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1)if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);x===void 0&&(x=w(n,a));let o=t?w(n,a):x;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),F(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}else return`data`in e&&F(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e;return e}function E(e){return e.generateMipmaps}function D(t){e.generateMipmap(t)}function ee(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function te(n,r,i,a,o,s=!1){if(n!==null){if(e[n]!==void 0)return e[n];F(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let c;a&&(c=t.get(`EXT_texture_norm16`),c||F(`WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension`));let l=r;if(r===e.RED&&(i===e.FLOAT&&(l=e.R32F),i===e.HALF_FLOAT&&(l=e.R16F),i===e.UNSIGNED_BYTE&&(l=e.R8),i===e.UNSIGNED_SHORT&&c&&(l=c.R16_EXT),i===e.SHORT&&c&&(l=c.R16_SNORM_EXT)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.R8UI),i===e.UNSIGNED_SHORT&&(l=e.R16UI),i===e.UNSIGNED_INT&&(l=e.R32UI),i===e.BYTE&&(l=e.R8I),i===e.SHORT&&(l=e.R16I),i===e.INT&&(l=e.R32I)),r===e.RG&&(i===e.FLOAT&&(l=e.RG32F),i===e.HALF_FLOAT&&(l=e.RG16F),i===e.UNSIGNED_BYTE&&(l=e.RG8),i===e.UNSIGNED_SHORT&&c&&(l=c.RG16_EXT),i===e.SHORT&&c&&(l=c.RG16_SNORM_EXT)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RG8UI),i===e.UNSIGNED_SHORT&&(l=e.RG16UI),i===e.UNSIGNED_INT&&(l=e.RG32UI),i===e.BYTE&&(l=e.RG8I),i===e.SHORT&&(l=e.RG16I),i===e.INT&&(l=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGB8UI),i===e.UNSIGNED_SHORT&&(l=e.RGB16UI),i===e.UNSIGNED_INT&&(l=e.RGB32UI),i===e.BYTE&&(l=e.RGB8I),i===e.SHORT&&(l=e.RGB16I),i===e.INT&&(l=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(l=e.RGBA16UI),i===e.UNSIGNED_INT&&(l=e.RGBA32UI),i===e.BYTE&&(l=e.RGBA8I),i===e.SHORT&&(l=e.RGBA16I),i===e.INT&&(l=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_SHORT&&c&&(l=c.RGB16_EXT),i===e.SHORT&&c&&(l=c.RGB16_SNORM_EXT),i===e.UNSIGNED_INT_5_9_9_9_REV&&(l=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(l=e.R11F_G11F_B10F)),r===e.RGBA){let t=s?$e:V.getTransfer(o);i===e.FLOAT&&(l=e.RGBA32F),i===e.HALF_FLOAT&&(l=e.RGBA16F),i===e.UNSIGNED_BYTE&&(l=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT&&c&&(l=c.RGBA16_EXT),i===e.SHORT&&c&&(l=c.RGBA16_SNORM_EXT),i===e.UNSIGNED_SHORT_4_4_4_4&&(l=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(l=e.RGB5_A1)}return(l===e.R16F||l===e.R32F||l===e.RG16F||l===e.RG32F||l===e.RGBA16F||l===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),l}function O(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,F(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function ne(e,t){return E(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function re(e){let t=e.target;t.removeEventListener(`dispose`,re),ie(t),t.isVideoTexture&&y.delete(t),t.isHTMLTexture&&b.delete(t)}function k(e){let t=e.target;t.removeEventListener(`dispose`,k),se(t)}function ie(e){let t=r.get(e);if(t.__webglInit===void 0)return;let n=e.source,i=S.get(n);if(i){let r=i[t.__cacheKey];r.usedTimes--,r.usedTimes===0&&ae(e),Object.keys(i).length===0&&S.delete(n)}r.remove(e)}function ae(t){let n=r.get(t);e.deleteTexture(n.__webglTexture);let i=t.source,a=S.get(i);delete a[n.__cacheKey],o.memory.textures--}function se(t){let n=r.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),r.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let i=t.textures;for(let t=0,n=i.length;t<n;t++){let n=r.get(i[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),o.memory.textures--),r.remove(i[t])}r.remove(t)}let ce=0;function le(){ce=0}function ue(){return ce}function de(e){ce=e}function fe(){let e=ce;return e>=i.maxTextures&&F(`WebGLTextures: Trying to use `+e+` texture units while this GPU supports only `+i.maxTextures),ce+=1,e}function pe(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function A(t,i){let a=r.get(t);if(t.isVideoTexture&&j(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&a.__version!==t.version){let e=t.image;if(e===null)F(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)F(`WebGLRenderer: Texture marked for update but image is incomplete`);else{we(a,t,i);return}}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);n.bindTexture(e.TEXTURE_2D,a.__webglTexture,e.TEXTURE0+i)}function me(t,i){let a=r.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version){we(a,t,i);return}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);n.bindTexture(e.TEXTURE_2D_ARRAY,a.__webglTexture,e.TEXTURE0+i)}function he(t,i){let a=r.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version){we(a,t,i);return}n.bindTexture(e.TEXTURE_3D,a.__webglTexture,e.TEXTURE0+i)}function ge(t,i){let a=r.get(t);if(t.isCubeDepthTexture!==!0&&t.version>0&&a.__version!==t.version){Te(a,t,i);return}n.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture,e.TEXTURE0+i)}let _e={[u]:e.REPEAT,[d]:e.CLAMP_TO_EDGE,[f]:e.MIRRORED_REPEAT},ve={[p]:e.NEAREST,[m]:e.NEAREST_MIPMAP_NEAREST,[h]:e.NEAREST_MIPMAP_LINEAR,[g]:e.LINEAR,[_]:e.LINEAR_MIPMAP_NEAREST,[v]:e.LINEAR_MIPMAP_LINEAR},ye={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function be(n,a){if(a.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(a.magFilter===1006||a.magFilter===1007||a.magFilter===1005||a.magFilter===1008||a.minFilter===1006||a.minFilter===1007||a.minFilter===1005||a.minFilter===1008)&&F(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,_e[a.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,_e[a.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,_e[a.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,ve[a.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,ve[a.minFilter]),a.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,ye[a.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(a.magFilter===1003||a.minFilter!==1005&&a.minFilter!==1008||a.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(a.anisotropy>1||r.get(a).__currentAnisotropy){let o=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,o.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(a.anisotropy,i.getMaxAnisotropy())),r.get(a).__currentAnisotropy=a.anisotropy}}}function xe(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,re));let i=n.source,a=S.get(i);a===void 0&&(a={},S.set(i,a));let s=pe(n);if(s!==t.__cacheKey){a[s]===void 0&&(a[s]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,r=!0),a[s].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&ae(n)),t.__cacheKey=s,t.__webglTexture=a[s].texture}return r}function Se(e,t,n){return Math.floor(Math.floor(e/n)/t)}function Ce(t,r,i,a){let o=t.updateRanges;if(o.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,r.width,r.height,i,a,r.data);else{o.sort((e,t)=>e.start-t.start);let s=0;for(let e=1;e<o.length;e++){let t=o[s],n=o[e],i=t.start+t.count,a=Se(n.start,r.width,4),c=Se(t.start,r.width,4);n.start<=i+1&&a===c&&Se(n.start+n.count-1,r.width,4)===a?t.count=Math.max(t.count,n.start+n.count-t.start):(++s,o[s]=n)}o.length=s+1;let c=n.getParameter(e.UNPACK_ROW_LENGTH),l=n.getParameter(e.UNPACK_SKIP_PIXELS),u=n.getParameter(e.UNPACK_SKIP_ROWS);n.pixelStorei(e.UNPACK_ROW_LENGTH,r.width);for(let t=0,s=o.length;t<s;t++){let s=o[t],c=Math.floor(s.start/4),l=Math.ceil(s.count/4),u=c%r.width,d=Math.floor(c/r.width),f=l;n.pixelStorei(e.UNPACK_SKIP_PIXELS,u),n.pixelStorei(e.UNPACK_SKIP_ROWS,d),n.texSubImage2D(e.TEXTURE_2D,0,u,d,f,1,i,a,r.data)}t.clearUpdateRanges(),n.pixelStorei(e.UNPACK_ROW_LENGTH,c),n.pixelStorei(e.UNPACK_SKIP_PIXELS,l),n.pixelStorei(e.UNPACK_SKIP_ROWS,u)}}function we(t,o,s){let c=e.TEXTURE_2D;(o.isDataArrayTexture||o.isCompressedArrayTexture)&&(c=e.TEXTURE_2D_ARRAY),o.isData3DTexture&&(c=e.TEXTURE_3D);let l=xe(t,o),u=o.source;n.bindTexture(c,t.__webglTexture,e.TEXTURE0+s);let d=r.get(u);if(u.version!==d.__version||l===!0){if(n.activeTexture(e.TEXTURE0+s),!(typeof ImageBitmap<`u`&&o.image instanceof ImageBitmap)){let t=V.getPrimaries(V.workingColorSpace),r=o.colorSpace===``?null:V.getPrimaries(o.colorSpace),i=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,i)}n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment);let t=T(o.image,!1,i.maxTextureSize);t=Re(o,t);let r=a.convert(o.format,o.colorSpace),f=a.convert(o.type),p=te(o.internalFormat,r,f,o.normalized,o.colorSpace,o.isVideoTexture);be(c,o);let m,h=o.mipmaps,g=o.isVideoTexture!==!0,_=d.__version===void 0||l===!0,v=u.dataReady,y=ne(o,t);if(o.isDepthTexture)p=O(o.format===oe,o.type),_&&(g?n.texStorage2D(e.TEXTURE_2D,1,p,t.width,t.height):n.texImage2D(e.TEXTURE_2D,0,p,t.width,t.height,0,r,f,null));else if(o.isDataTexture)if(h.length>0){g&&_&&n.texStorage2D(e.TEXTURE_2D,y,p,h[0].width,h[0].height);for(let t=0,i=h.length;t<i;t++)m=h[t],g?v&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,m.width,m.height,r,f,m.data):n.texImage2D(e.TEXTURE_2D,t,p,m.width,m.height,0,r,f,m.data);o.generateMipmaps=!1}else g?(_&&n.texStorage2D(e.TEXTURE_2D,y,p,t.width,t.height),v&&Ce(o,t,r,f)):n.texImage2D(e.TEXTURE_2D,0,p,t.width,t.height,0,r,f,t.data);else if(o.isCompressedTexture)if(o.isCompressedArrayTexture){g&&_&&n.texStorage3D(e.TEXTURE_2D_ARRAY,y,p,h[0].width,h[0].height,t.depth);for(let i=0,a=h.length;i<a;i++)if(m=h[i],o.format!==1023)if(r!==null)if(g){if(v)if(o.layerUpdates.size>0){let t=pc(m.width,m.height,o.format,o.type);for(let a of o.layerUpdates){let o=m.data.subarray(a*t/m.data.BYTES_PER_ELEMENT,(a+1)*t/m.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,a,m.width,m.height,1,r,o)}o.clearLayerUpdates()}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,0,m.width,m.height,t.depth,r,m.data)}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,i,p,m.width,m.height,t.depth,0,m.data,0,0);else F(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`);else g?v&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,0,m.width,m.height,t.depth,r,f,m.data):n.texImage3D(e.TEXTURE_2D_ARRAY,i,p,m.width,m.height,t.depth,0,r,f,m.data)}else{g&&_&&n.texStorage2D(e.TEXTURE_2D,y,p,h[0].width,h[0].height);for(let t=0,i=h.length;t<i;t++)m=h[t],o.format===1023?g?v&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,m.width,m.height,r,f,m.data):n.texImage2D(e.TEXTURE_2D,t,p,m.width,m.height,0,r,f,m.data):r===null?F(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):g?v&&n.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,m.width,m.height,r,m.data):n.compressedTexImage2D(e.TEXTURE_2D,t,p,m.width,m.height,0,m.data)}else if(o.isDataArrayTexture)if(g){if(_&&n.texStorage3D(e.TEXTURE_2D_ARRAY,y,p,t.width,t.height,t.depth),v)if(o.layerUpdates.size>0){let i=pc(t.width,t.height,o.format,o.type);for(let a of o.layerUpdates){let o=t.data.subarray(a*i/t.data.BYTES_PER_ELEMENT,(a+1)*i/t.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,a,t.width,t.height,1,r,f,o)}o.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,t.width,t.height,t.depth,r,f,t.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,p,t.width,t.height,t.depth,0,r,f,t.data);else if(o.isData3DTexture)g?(_&&n.texStorage3D(e.TEXTURE_3D,y,p,t.width,t.height,t.depth),v&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,t.width,t.height,t.depth,r,f,t.data)):n.texImage3D(e.TEXTURE_3D,0,p,t.width,t.height,t.depth,0,r,f,t.data);else if(o.isFramebufferTexture){if(_)if(g)n.texStorage2D(e.TEXTURE_2D,y,p,t.width,t.height);else{let i=t.width,a=t.height;for(let t=0;t<y;t++)n.texImage2D(e.TEXTURE_2D,t,p,i,a,0,r,f,null),i>>=1,a>>=1}}else if(o.isHTMLTexture){if(`texElementImage2D`in e){let n=e.canvas;if(n.hasAttribute(`layoutsubtree`)||n.setAttribute(`layoutsubtree`,`true`),t.parentNode!==n){n.appendChild(t),b.add(o),n.onpaint=e=>{let t=e.changedElements;for(let e of b)t.includes(e.image)&&(e.needsUpdate=!0)},n.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,t);else{let n=e.RGBA,r=e.RGBA,i=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,n,r,i,t)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(h.length>0){if(g&&_){let t=ze(h[0]);n.texStorage2D(e.TEXTURE_2D,y,p,t.width,t.height)}for(let t=0,i=h.length;t<i;t++)m=h[t],g?v&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,r,f,m):n.texImage2D(e.TEXTURE_2D,t,p,r,f,m);o.generateMipmaps=!1}else if(g){if(_){let r=ze(t);n.texStorage2D(e.TEXTURE_2D,y,p,r.width,r.height)}v&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,r,f,t)}else n.texImage2D(e.TEXTURE_2D,0,p,r,f,t);E(o)&&D(c),d.__version=u.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function Te(t,o,s){if(o.image.length!==6)return;let c=xe(t,o),l=o.source;n.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+s);let u=r.get(l);if(l.version!==u.__version||c===!0){n.activeTexture(e.TEXTURE0+s);let t=V.getPrimaries(V.workingColorSpace),r=o.colorSpace===``?null:V.getPrimaries(o.colorSpace),d=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,d);let f=o.isCompressedTexture||o.image[0].isCompressedTexture,p=o.image[0]&&o.image[0].isDataTexture,m=[];for(let e=0;e<6;e++)!f&&!p?m[e]=T(o.image[e],!0,i.maxCubemapSize):m[e]=p?o.image[e].image:o.image[e],m[e]=Re(o,m[e]);let h=m[0],g=a.convert(o.format,o.colorSpace),_=a.convert(o.type),v=te(o.internalFormat,g,_,o.normalized,o.colorSpace),y=o.isVideoTexture!==!0,b=u.__version===void 0||c===!0,x=l.dataReady,S=ne(o,h);be(e.TEXTURE_CUBE_MAP,o);let C;if(f){y&&b&&n.texStorage2D(e.TEXTURE_CUBE_MAP,S,v,h.width,h.height);for(let t=0;t<6;t++){C=m[t].mipmaps;for(let r=0;r<C.length;r++){let i=C[r];o.format===1023?y?x&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,_,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,v,i.width,i.height,0,g,_,i.data):g===null?F(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):y?x&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,i.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,v,i.width,i.height,0,i.data)}}}else{if(C=o.mipmaps,y&&b){C.length>0&&S++;let t=ze(m[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,S,v,t.width,t.height)}for(let t=0;t<6;t++)if(p){y?x&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,m[t].width,m[t].height,g,_,m[t].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,m[t].width,m[t].height,0,g,_,m[t].data);for(let r=0;r<C.length;r++){let i=C[r].image[t].image;y?x&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,i.width,i.height,g,_,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,v,i.width,i.height,0,g,_,i.data)}}else{y?x&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,g,_,m[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,g,_,m[t]);for(let r=0;r<C.length;r++){let i=C[r];y?x&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,g,_,i.image[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,v,g,_,i.image[t])}}}E(o)&&D(e.TEXTURE_CUBE_MAP),u.__version=l.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function Ee(t,i,o,c,l,u){let d=a.convert(o.format,o.colorSpace),f=a.convert(o.type),p=te(o.internalFormat,d,f,o.normalized,o.colorSpace),m=r.get(i),h=r.get(o);if(h.__renderTarget=i,!m.__hasExternalTextures){let t=Math.max(1,i.width>>u),r=Math.max(1,i.height>>u);l===e.TEXTURE_3D||l===e.TEXTURE_2D_ARRAY?n.texImage3D(l,u,p,t,r,i.depth,0,d,f,null):n.texImage2D(l,u,p,t,r,0,d,f,null)}n.bindFramebuffer(e.FRAMEBUFFER,t),Le(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,c,l,h.__webglTexture,0,Ie(i)):(l===e.TEXTURE_2D||l>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&l<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,c,l,h.__webglTexture,u),n.bindFramebuffer(e.FRAMEBUFFER,null)}function De(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=O(n.stencilBuffer,a),c=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;Le(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Ie(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Ie(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,c,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let o=t[i],c=a.convert(o.format,o.colorSpace),l=a.convert(o.type),u=te(o.internalFormat,c,l,o.normalized,o.colorSpace);Le(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Ie(n),u,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Ie(n),u,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,u,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Oe(t,i,o){let c=i.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,t),!(i.depthTexture&&i.depthTexture.isDepthTexture))throw Error(`THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.`);let l=r.get(i.depthTexture);if(l.__renderTarget=i,(!l.__webglTexture||i.depthTexture.image.width!==i.width||i.depthTexture.image.height!==i.height)&&(i.depthTexture.image.width=i.width,i.depthTexture.image.height=i.height,i.depthTexture.needsUpdate=!0),c){if(l.__webglInit===void 0&&(l.__webglInit=!0,i.depthTexture.addEventListener(`dispose`,re)),l.__webglTexture===void 0){l.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,l.__webglTexture),be(e.TEXTURE_CUBE_MAP,i.depthTexture);let t=a.convert(i.depthTexture.format),r=a.convert(i.depthTexture.type),o;i.depthTexture.format===1026?o=e.DEPTH_COMPONENT24:i.depthTexture.format===1027&&(o=e.DEPTH24_STENCIL8);for(let n=0;n<6;n++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0,o,i.width,i.height,0,t,r,null)}}else A(i.depthTexture,0);let u=l.__webglTexture,d=Ie(i),f=c?e.TEXTURE_CUBE_MAP_POSITIVE_X+o:e.TEXTURE_2D,p=i.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(i.depthTexture.format===1026)Le(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else if(i.depthTexture.format===1027)Le(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else throw Error(`THREE.WebGLTextures: Unknown depthTexture format.`)}function ke(t){let i=r.get(t),a=t.isWebGLCubeRenderTarget===!0;if(i.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(i.__depthDisposeCallback&&i.__depthDisposeCallback(),e){let t=()=>{delete i.__boundDepthTexture,delete i.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),i.__depthDisposeCallback=t}i.__boundDepthTexture=e}if(t.depthTexture&&!i.__autoAllocateDepthBuffer)if(a)for(let e=0;e<6;e++)Oe(i.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?Oe(i.__webglFramebuffer[0],t,0):Oe(i.__webglFramebuffer,t,0)}else if(a){i.__webglDepthbuffer=[];for(let r=0;r<6;r++)if(n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[r]),i.__webglDepthbuffer[r]===void 0)i.__webglDepthbuffer[r]=e.createRenderbuffer(),De(i.__webglDepthbuffer[r],t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=i.__webglDepthbuffer[r];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,a)}}else{let r=t.texture.mipmaps;if(r&&r.length>0?n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[0]):n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer),i.__webglDepthbuffer===void 0)i.__webglDepthbuffer=e.createRenderbuffer(),De(i.__webglDepthbuffer,t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,r=i.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,r),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,r)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function Ae(t,n,i){let a=r.get(t);n!==void 0&&Ee(a.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),i!==void 0&&ke(t)}function je(t){let i=t.texture,s=r.get(t),c=r.get(i);t.addEventListener(`dispose`,k);let l=t.textures,u=t.isWebGLCubeRenderTarget===!0,d=l.length>1;if(d||(c.__webglTexture===void 0&&(c.__webglTexture=e.createTexture()),c.__version=i.version,o.memory.textures++),u){s.__webglFramebuffer=[];for(let t=0;t<6;t++)if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer[t]=[];for(let n=0;n<i.mipmaps.length;n++)s.__webglFramebuffer[t][n]=e.createFramebuffer()}else s.__webglFramebuffer[t]=e.createFramebuffer()}else{if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer=[];for(let t=0;t<i.mipmaps.length;t++)s.__webglFramebuffer[t]=e.createFramebuffer()}else s.__webglFramebuffer=e.createFramebuffer();if(d)for(let t=0,n=l.length;t<n;t++){let n=r.get(l[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),o.memory.textures++)}if(t.samples>0&&Le(t)===!1){s.__webglMultisampledFramebuffer=e.createFramebuffer(),s.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer);for(let n=0;n<l.length;n++){let r=l[n];s.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,s.__webglColorRenderbuffer[n]);let i=a.convert(r.format,r.colorSpace),o=a.convert(r.type),c=te(r.internalFormat,i,o,r.normalized,r.colorSpace,t.isXRRenderTarget===!0),u=Ie(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,u,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,s.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(s.__webglDepthRenderbuffer=e.createRenderbuffer(),De(s.__webglDepthRenderbuffer,t,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(u){n.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),be(e.TEXTURE_CUBE_MAP,i);for(let n=0;n<6;n++)if(i.mipmaps&&i.mipmaps.length>0)for(let r=0;r<i.mipmaps.length;r++)Ee(s.__webglFramebuffer[n][r],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,r);else Ee(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0);E(i)&&D(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(d){for(let i=0,a=l.length;i<a;i++){let a=l[i],o=r.get(a),c=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(c=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(c,o.__webglTexture),be(c,a),Ee(s.__webglFramebuffer,t,a,e.COLOR_ATTACHMENT0+i,c,0),E(a)&&D(c)}n.unbindTexture()}else{let r=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(r=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(r,c.__webglTexture),be(r,i),i.mipmaps&&i.mipmaps.length>0)for(let n=0;n<i.mipmaps.length;n++)Ee(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,r,n);else Ee(s.__webglFramebuffer,t,i,e.COLOR_ATTACHMENT0,r,0);E(i)&&D(r),n.unbindTexture()}t.depthBuffer&&ke(t)}function Me(e){let t=e.textures;for(let i=0,a=t.length;i<a;i++){let a=t[i];if(E(a)){let t=ee(e),i=r.get(a).__webglTexture;n.bindTexture(t,i),D(t),n.unbindTexture()}}}let Ne=[],Pe=[];function Fe(t){if(t.samples>0){if(Le(t)===!1){let i=t.textures,a=t.width,o=t.height,s=e.COLOR_BUFFER_BIT,l=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,u=r.get(t),d=i.length>1;if(d)for(let t=0;t<i.length;t++)n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,u.__webglMultisampledFramebuffer);let f=t.texture.mipmaps;f&&f.length>0?n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer[0]):n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer);for(let n=0;n<i.length;n++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(s|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(s|=e.STENCIL_BUFFER_BIT)),d){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,u.__webglColorRenderbuffer[n]);let t=r.get(i[n]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,a,o,0,0,a,o,s,e.NEAREST),c===!0&&(Ne.length=0,Pe.length=0,Ne.push(e.COLOR_ATTACHMENT0+n),t.depthBuffer&&t.resolveDepthBuffer===!1&&(Ne.push(l),Pe.push(l),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Pe)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,Ne))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),d)for(let t=0;t<i.length;t++){n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,u.__webglColorRenderbuffer[t]);let a=r.get(i[t]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,a,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.resolveDepthBuffer===!1&&c){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function Ie(e){return Math.min(i.maxSamples,e.samples)}function Le(e){let n=r.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function j(e){let t=o.render.frame;y.get(e)!==t&&(y.set(e,t),e.update())}function Re(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(V.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&F(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):I(`WebGLTextures: Unsupported texture color space:`,n)),t}function ze(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(l.width=e.naturalWidth||e.width,l.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(l.width=e.displayWidth,l.height=e.displayHeight):(l.width=e.width,l.height=e.height),l}this.allocateTextureUnit=fe,this.resetTextureUnits=le,this.getTextureUnits=ue,this.setTextureUnits=de,this.setTexture2D=A,this.setTexture2DArray=me,this.setTexture3D=he,this.setTextureCube=ge,this.rebindTextures=Ae,this.setupRenderTarget=je,this.updateRenderTargetMipmap=Me,this.updateMultisampleRenderTarget=Fe,this.setupDepthRenderbuffer=ke,this.setupFrameBufferTexture=Ee,this.useMultisampledRTT=Le,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function vd(e,t){function n(n,r=``){let i,a=V.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779)if(a===`srgb`)if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===35840||n===35841||n===35842||n===35843)if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491)if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821)if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===36492||n===36494||n===36495)if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===36283||n===36284||n===36285||n===36286)if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var yd=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,bd=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,xd=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new ya(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new ts({vertexShader:yd,fragmentShader:bd,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new U(new Ho(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Sd=class extends mt{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,l=null,u=null,d=null,f=null,p=null,m=typeof XRWebGLBinding<`u`,h=new xd,g={},_=t.getContextAttributes(),v=null,b=null,x=[],S=[],C=new R,T=null,E=new Bs;E.viewport=new an;let D=new Bs;D.viewport=new an;let ee=[E,D],O=new Xs,ne=null,re=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=x[e];return t===void 0&&(t=new Bn,x[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=x[e];return t===void 0&&(t=new Bn,x[e]=t),t.getGripSpace()},this.getHand=function(e){let t=x[e];return t===void 0&&(t=new Bn,x[e]=t),t.getHandSpace()};function k(e){let t=S.indexOf(e.inputSource);if(t===-1)return;let n=x[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function se(){r.removeEventListener(`select`,k),r.removeEventListener(`selectstart`,k),r.removeEventListener(`selectend`,k),r.removeEventListener(`squeeze`,k),r.removeEventListener(`squeezestart`,k),r.removeEventListener(`squeezeend`,k),r.removeEventListener(`end`,se),r.removeEventListener(`inputsourceschange`,ce);for(let e=0;e<x.length;e++){let t=S[e];t!==null&&(S[e]=null,x[e].disconnect(t))}ne=null,re=null,h.reset();for(let e in g)delete g[e];e.setRenderTarget(v),f=null,d=null,u=null,r=null,b=null,he.stop(),n.isPresenting=!1,e.setPixelRatio(T),e.setSize(C.width,C.height,!1),n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&F(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&F(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return d===null?f:d},this.getBinding=function(){return u===null&&m&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return p},this.getSession=function(){return r},this.setSession=async function(l){if(r=l,r!==null){if(v=e.getRenderTarget(),r.addEventListener(`select`,k),r.addEventListener(`selectstart`,k),r.addEventListener(`selectend`,k),r.addEventListener(`squeeze`,k),r.addEventListener(`squeezestart`,k),r.addEventListener(`squeezeend`,k),r.addEventListener(`end`,se),r.addEventListener(`inputsourceschange`,ce),_.xrCompatible!==!0&&await t.makeXRCompatible(),T=e.getPixelRatio(),e.getSize(C),m&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;_.depth&&(o=_.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=_.stencil?oe:ae,a=_.stencil?te:w);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};u=this.getBinding(),d=u.createProjectionLayer(s),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),b=new sn(d.textureWidth,d.textureHeight,{format:ie,type:y,depthTexture:new _a(d.textureWidth,d.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:_.stencil,colorSpace:e.outputColorSpace,samples:_.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let n={antialias:_.antialias,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:i};f=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),b=new sn(f.framebufferWidth,f.framebufferHeight,{format:ie,type:y,colorSpace:e.outputColorSpace,stencilBuffer:_.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}b.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),he.setContext(r),he.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return h.getDepthTexture()};function ce(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=S.indexOf(n);r>=0&&(S[r]=null,x[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=S.indexOf(n);if(r===-1){for(let e=0;e<x.length;e++)if(e>=S.length){S.push(n),r=e;break}else if(S[e]===null){S[e]=n,r=e;break}if(r===-1)break}let i=x[r];i&&i.connect(n)}}let le=new z,ue=new z;function de(e,t,n){le.setFromMatrixPosition(t.matrixWorld),ue.setFromMatrixPosition(n.matrixWorld);let r=le.distanceTo(ue),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function fe(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;h.texture!==null&&(h.depthNear>0&&(t=h.depthNear),h.depthFar>0&&(n=h.depthFar)),O.near=D.near=E.near=t,O.far=D.far=E.far=n,(ne!==O.near||re!==O.far)&&(r.updateRenderState({depthNear:O.near,depthFar:O.far}),ne=O.near,re=O.far),O.layers.mask=e.layers.mask|6,E.layers.mask=O.layers.mask&-5,D.layers.mask=O.layers.mask&-3;let i=e.parent,a=O.cameras;fe(O,i);for(let e=0;e<a.length;e++)fe(a[e],i);a.length===2?de(O,E,D):O.projectionMatrix.copy(E.projectionMatrix),pe(e,O,i)};function pe(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=vt*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return O},this.getFoveation=function(){if(!(d===null&&f===null))return s},this.setFoveation=function(e){s=e,d!==null&&(d.fixedFoveation=e),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=e)},this.hasDepthSensing=function(){return h.texture!==null},this.getDepthSensingMesh=function(){return h.getMesh(O)},this.getCameraTexture=function(e){return g[e]};let A=null;function me(t,i){if(l=i.getViewerPose(c||a),p=i,l!==null){let t=l.views;f!==null&&(e.setRenderTargetFramebuffer(b,f.framebuffer),e.setRenderTarget(b));let i=!1;t.length!==O.cameras.length&&(O.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(f!==null)a=f.getViewport(r);else{let t=u.getViewSubImage(d,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(b,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(b))}let o=ee[n];o===void 0&&(o=new Bs,o.layers.enable(n),o.viewport=new an,ee[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(O.matrix.copy(o.matrix),O.matrix.decompose(O.position,O.quaternion,O.scale)),i===!0&&O.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&m){u=n.getBinding();let e=u.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&h.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&m){e.state.unbindTexture(),u=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=g[n];e||(e=new ya,g[n]=e);let t=u.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<x.length;e++){let t=S[e],n=x[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}A&&A(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),p=null}let he=new hc;he.setAnimationLoop(me),this.setAnimationLoop=function(e){A=e},this.dispose=function(){}}},Cd=new un,wd=new B;wd.set(-1,0,0,0,1,0,0,0,1);function Td(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,Zo(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isNodeMaterial?t.uniformsNeedUpdate=!1:t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,e.envMapRotation.value.setFromMatrix4(Cd.makeRotationFromEuler(o)).transpose(),a.isCubeTexture&&a.isRenderTargetTexture===!1&&e.envMapRotation.value.premultiply(wd),e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function Ed(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(g(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,v));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return I(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let e=0,t=r.length;e<t;e++){let t=r[e];if(Array.isArray(t))for(let n=0,r=t.length;n<r;n++)p(t[n],e,n,a);else p(t,e,0,a)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(t,n,r,i){if(h(t,n,r,i)===!0){let n=t.__offset,r=t.value;if(Array.isArray(r)){let e=0;for(let n=0;n<r.length;n++){let i=r[n],a=_(i);m(i,t.__data,e),typeof i!=`number`&&typeof i!=`boolean`&&!i.isMatrix3&&!ArrayBuffer.isView(i)&&(e+=a.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(r,t.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,n,t.__data)}}function m(e,t,n){typeof e==`number`||typeof e==`boolean`?t[0]=e:e.isMatrix3?(t[0]=e.elements[0],t[1]=e.elements[1],t[2]=e.elements[2],t[3]=0,t[4]=e.elements[3],t[5]=e.elements[4],t[6]=e.elements[5],t[7]=0,t[8]=e.elements[6],t[9]=e.elements[7],t[10]=e.elements[8],t[11]=0):ArrayBuffer.isView(e)?t.set(new e.constructor(e.buffer,e.byteOffset,t.length)):e.toArray(t,n)}function h(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return typeof i==`number`||typeof i==`boolean`?r[a]=i:ArrayBuffer.isView(i)?r[a]=i.slice():r[a]=i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(ArrayBuffer.isView(i))return!0;else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function g(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=_(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function _(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?F(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):ArrayBuffer.isView(e)?(t.boundary=16,t.storage=e.byteLength):F(`WebGLRenderer: Unsupported uniform value type.`,e),t}function v(t){let n=t.target;n.removeEventListener(`dispose`,v);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function y(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:y}}var Dd=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Od=null;function kd(){return Od===null&&(Od=new ji(Dd,16,16,le,E),Od.name=`DFG_LUT`,Od.minFilter=g,Od.magFilter=g,Od.wrapS=d,Od.wrapT=d,Od.generateMipmaps=!1,Od.needsUpdate=!0),Od}var Ad=class{constructor(e={}){let{canvas:t=st(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:s=!0,preserveDrawingBuffer:c=!1,powerPreference:l=`default`,failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:f=y}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);p=n.getContextAttributes().alpha}else p=a;let m=f,h=new Set([de,ue,ce]),g=new Set([y,w,S,te,D,ee]),_=new Uint32Array(4),b=new Int32Array(4),x=new z,C=null,T=null,O=[],ne=[],re=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let k=this,ie=!1,ae=null,oe=null,se=null,le=null;this._outputColorSpace=Ze;let fe=0,pe=0,A=null,me=-1,he=null,ge=new an,_e=new an,ve=null,ye=new H(0),be=0,xe=t.width,Se=t.height,Ce=1,we=null,Te=null,Ee=new an(0,0,xe,Se),De=new an(0,0,xe,Se),Oe=!1,ke=new Ji,Ae=!1,je=!1,Me=new un,Ne=new z,Pe=new an,Fe={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Ie=!1;function Le(){return A===null?Ce:1}let j=n;function Re(e,n){return t.getContext(e,n)}try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:s,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:u};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r185`),t.addEventListener(`webglcontextlost`,dt,!1),t.addEventListener(`webglcontextrestored`,pt,!1),t.addEventListener(`webglcontextcreationerror`,mt,!1),j===null){let t=`webgl2`;if(j=Re(t,e),j===null)throw Re(t)?Error(`THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.`):Error(`THREE.WebGLRenderer: Error creating WebGL context.`)}}catch(e){throw I(`WebGLRenderer: `+e.message),e}let ze,Be,M,Ve,N,P,He,Ue,We,Ge,Ke,qe,Je,Ye,Xe,Qe,$e,et,tt,nt,it,at,ot;function ct(){ze=new Jc(j),ze.init(),it=new vd(j,ze),Be=new wc(j,ze,e,it),M=new gd(j,ze),Be.reversedDepthBuffer&&d&&M.buffers.depth.setReversed(!0),oe=j.createFramebuffer(),se=j.createFramebuffer(),le=j.createFramebuffer(),Ve=new Zc(j),N=new Xu,P=new _d(j,ze,M,N,Be,it,Ve),He=new qc(k),Ue=new gc(j),at=new Sc(j,Ue),We=new Yc(j,Ue,Ve,at),Ge=new $c(j,We,Ue,at,Ve),et=new Qc(j,Be,P),Xe=new Tc(N),Ke=new Yu(k,He,ze,Be,at,Xe),qe=new Td(k,N),Je=new ed,Ye=new sd(ze),$e=new xc(k,He,M,Ge,p,s),Qe=new hd(k,Ge,Be),ot=new Ed(j,Ve,Be,M),tt=new Cc(j,ze,Ve),nt=new Xc(j,ze,Ve),Ve.programs=Ke.programs,k.capabilities=Be,k.extensions=ze,k.properties=N,k.renderLists=Je,k.shadowMap=Qe,k.state=M,k.info=Ve}ct(),m!==1009&&(re=new tl(m,t.width,t.height,o,r,i));let ut=new Sd(k,j);this.xr=ut,this.getContext=function(){return j},this.getContextAttributes=function(){return j.getContextAttributes()},this.forceContextLoss=function(){let e=ze.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=ze.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return Ce},this.setPixelRatio=function(e){e!==void 0&&(Ce=e,this.setSize(xe,Se,!1))},this.getSize=function(e){return e.set(xe,Se)},this.setSize=function(e,n,r=!0){if(ut.isPresenting){F(`WebGLRenderer: Can't change size while VR device is presenting.`);return}xe=e,Se=n,t.width=Math.floor(e*Ce),t.height=Math.floor(n*Ce),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),re!==null&&re.setSize(t.width,t.height),this.setViewport(0,0,e,n)},this.getDrawingBufferSize=function(e){return e.set(xe*Ce,Se*Ce).floor()},this.setDrawingBufferSize=function(e,n,r){xe=e,Se=n,Ce=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(m===1009){I(`WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);return}if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){F(`WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}re.setEffects(e||[])},this.getCurrentViewport=function(e){return e.copy(ge)},this.getViewport=function(e){return e.copy(Ee)},this.setViewport=function(e,t,n,r){e.isVector4?Ee.set(e.x,e.y,e.z,e.w):Ee.set(e,t,n,r),M.viewport(ge.copy(Ee).multiplyScalar(Ce).round())},this.getScissor=function(e){return e.copy(De)},this.setScissor=function(e,t,n,r){e.isVector4?De.set(e.x,e.y,e.z,e.w):De.set(e,t,n,r),M.scissor(_e.copy(De).multiplyScalar(Ce).round())},this.getScissorTest=function(){return Oe},this.setScissorTest=function(e){M.setScissorTest(Oe=e)},this.setOpaqueSort=function(e){we=e},this.setTransparentSort=function(e){Te=e},this.getClearColor=function(e){return e.copy($e.getClearColor())},this.setClearColor=function(){$e.setClearColor(...arguments)},this.getClearAlpha=function(){return $e.getClearAlpha()},this.setClearAlpha=function(){$e.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(A!==null){let t=A.texture.format;e=h.has(t)}if(e){let e=A.texture.type,t=g.has(e),n=$e.getClearColor(),r=$e.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(_[0]=i,_[1]=a,_[2]=o,_[3]=r,j.clearBufferuiv(j.COLOR,0,_)):(b[0]=i,b[1]=a,b[2]=o,b[3]=r,j.clearBufferiv(j.COLOR,0,b))}else r|=j.COLOR_BUFFER_BIT}t&&(r|=j.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),n&&(r|=j.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&j.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(e){e.setRenderer(this),ae=e},this.dispose=function(){t.removeEventListener(`webglcontextlost`,dt,!1),t.removeEventListener(`webglcontextrestored`,pt,!1),t.removeEventListener(`webglcontextcreationerror`,mt,!1),$e.dispose(),Je.dispose(),Ye.dispose(),N.dispose(),He.dispose(),Ge.dispose(),at.dispose(),ot.dispose(),Ke.dispose(),ut.dispose(),ut.removeEventListener(`sessionstart`,bt),ut.removeEventListener(`sessionend`,xt),St.stop()};function dt(e){e.preventDefault(),lt(`WebGLRenderer: Context Lost.`),ie=!0}function pt(){lt(`WebGLRenderer: Context Restored.`),ie=!1;let e=Ve.autoReset,t=Qe.enabled,n=Qe.autoUpdate,r=Qe.needsUpdate,i=Qe.type;ct(),Ve.autoReset=e,Qe.enabled=t,Qe.autoUpdate=n,Qe.needsUpdate=r,Qe.type=i}function mt(e){I(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function ht(e){let t=e.target;t.removeEventListener(`dispose`,ht),gt(t)}function gt(e){_t(e),N.remove(e)}function _t(e){let t=N.get(e).programs;t!==void 0&&(t.forEach(function(e){Ke.releaseProgram(e)}),e.isShaderMaterial&&Ke.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=Fe);let o=i.isMesh&&i.matrixWorld.determinantAffine()<0,s=Mt(e,t,n,r,i);M.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=We.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;at.setup(i,r,s,n,c);let h,g=tt;if(c!==null&&(h=Ue.get(c),g=nt,g.setIndex(h)),i.isMesh)r.wireframe===!0?(M.setLineWidth(r.wireframeLinewidth*Le()),g.setMode(j.LINES)):g.setMode(j.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),M.setLineWidth(e*Le()),i.isLineSegments?g.setMode(j.LINES):i.isLineLoop?g.setMode(j.LINE_LOOP):g.setMode(j.LINE_STRIP)}else i.isPoints?g.setMode(j.POINTS):i.isSprite&&g.setMode(j.TRIANGLES);if(i.isBatchedMesh)if(ze.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Ue.get(c).bytesPerElement:1,o=N.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(j,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function vt(e,t,n){e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,Ot(e,t,n),e.side=0,e.needsUpdate=!0,Ot(e,t,n),e.side=2):Ot(e,t,n)}this.compile=function(e,t,n=null){n===null&&(n=e),T=Ye.get(n),T.init(t),ne.push(T),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),T.setupLights();let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let t=e.material;if(t)if(Array.isArray(t))for(let i=0;i<t.length;i++){let a=t[i];vt(a,n,e),r.add(a)}else vt(t,n,e),r.add(t)}),T=ne.pop(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){if(r.forEach(function(e){N.get(e).currentProgram.isReady()&&r.delete(e)}),r.size===0){t(e);return}setTimeout(n,10)}ze.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let yt=null;function L(e){yt&&yt(e)}function bt(){St.stop()}function xt(){St.start()}let St=new hc;St.setAnimationLoop(L),typeof self<`u`&&St.setContext(self),this.setAnimationLoop=function(e){yt=e,ut.setAnimationLoop(e),e===null?St.stop():St.start()},ut.addEventListener(`sessionstart`,bt),ut.addEventListener(`sessionend`,xt),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){I(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(ie===!0)return;ae!==null&&ae.renderStart(e,t);let n=ut.enabled===!0&&ut.isPresenting===!0,r=re!==null&&(A===null||n)&&re.begin(k,A);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),ut.enabled===!0&&ut.isPresenting===!0&&(re===null||re.isCompositing()===!1)&&(ut.cameraAutoUpdate===!0&&ut.updateCamera(t),t=ut.getCamera()),e.isScene===!0&&e.onBeforeRender(k,e,t,A),T=Ye.get(e,ne.length),T.init(t),T.state.textureUnits=P.getTextureUnits(),ne.push(T),Me.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),ke.setFromProjectionMatrix(Me,rt,t.reversedDepth),je=this.localClippingEnabled,Ae=Xe.init(this.clippingPlanes,je),C=Je.get(e,O.length),C.init(),O.push(C),ut.enabled===!0&&ut.isPresenting===!0){let e=k.xr.getDepthSensingMesh();e!==null&&Ct(e,t,-1/0,k.sortObjects)}Ct(e,t,0,k.sortObjects),C.finish(),k.sortObjects===!0&&C.sort(we,Te,t.reversedDepth),Ie=ut.enabled===!1||ut.isPresenting===!1||ut.hasDepthSensing()===!1,Ie&&$e.addToRenderList(C,e),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ae===!0&&Xe.beginShadows();let i=T.state.shadowsArray;if(Qe.render(i,e,t),Ae===!0&&Xe.endShadows(),(r&&re.hasRenderPass())===!1){let n=C.opaque,r=C.transmissive;if(T.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];Tt(n,r,e,a)}Ie&&$e.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];wt(C,e,n,n.viewport)}}else r.length>0&&Tt(n,r,e,t),Ie&&$e.render(e),wt(C,e,t)}A!==null&&pe===0&&(P.updateMultisampleRenderTarget(A),P.updateRenderTargetMipmap(A)),r&&re.end(k),e.isScene===!0&&e.onAfterRender(k,e,t),at.resetDefaultState(),me=-1,he=null,ne.pop(),ne.length>0?(T=ne[ne.length-1],P.setTextureUnits(T.state.textureUnits),Ae===!0&&Xe.setGlobalState(k.clippingPlanes,T.state.camera)):T=null,O.pop(),C=O.length>0?O[O.length-1]:null,ae!==null&&ae.renderEnd()};function Ct(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLightProbeGrid)T.pushLightProbeGrid(e);else if(e.isLight)T.pushLight(e),e.castShadow&&T.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||ke.intersectsSprite(e)){r&&Pe.setFromMatrixPosition(e.matrixWorld).applyMatrix4(Me);let t=Ge.update(e),i=e.material;i.visible&&C.push(e,t,i,n,Pe.z,null)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||ke.intersectsObject(e))){let t=Ge.update(e),i=e.material;if(r&&(e.boundingSphere===void 0?(t.boundingSphere===null&&t.computeBoundingSphere(),Pe.copy(t.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),Pe.copy(e.boundingSphere.center)),Pe.applyMatrix4(e.matrixWorld).applyMatrix4(Me)),Array.isArray(i)){let r=t.groups;for(let a=0,o=r.length;a<o;a++){let o=r[a],s=i[o.materialIndex];s&&s.visible&&C.push(e,t,s,n,Pe.z,o)}}else i.visible&&C.push(e,t,i,n,Pe.z,null)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)Ct(i[e],t,n,r)}function wt(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;T.setupLightsView(n),Ae===!0&&Xe.setGlobalState(k.clippingPlanes,n),r&&M.viewport(ge.copy(r)),i.length>0&&Et(i,t,n),a.length>0&&Et(a,t,n),o.length>0&&Et(o,t,n),M.buffers.depth.setTest(!0),M.buffers.depth.setMask(!0),M.buffers.color.setMask(!0),M.setPolygonOffset(!1)}function Tt(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(T.state.transmissionRenderTarget[r.id]===void 0){let e=ze.has(`EXT_color_buffer_half_float`)||ze.has(`EXT_color_buffer_float`);T.state.transmissionRenderTarget[r.id]=new sn(1,1,{generateMipmaps:!0,type:e?E:y,minFilter:v,samples:Math.max(4,Be.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:V.workingColorSpace})}let a=T.state.transmissionRenderTarget[r.id],o=r.viewport||ge;a.setSize(o.z*k.transmissionResolutionScale,o.w*k.transmissionResolutionScale);let s=k.getRenderTarget(),c=k.getActiveCubeFace(),l=k.getActiveMipmapLevel();k.setRenderTarget(a),k.getClearColor(ye),be=k.getClearAlpha(),be<1&&k.setClearColor(16777215,.5),k.clear(),Ie&&$e.render(n);let u=k.toneMapping;k.toneMapping=0;let d=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),T.setupLightsView(r),Ae===!0&&Xe.setGlobalState(k.clippingPlanes,r),Et(e,n,r),P.updateMultisampleRenderTarget(a),P.updateRenderTargetMipmap(a),ze.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,Dt(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(P.updateMultisampleRenderTarget(a),P.updateRenderTargetMipmap(a))}k.setRenderTarget(s,c,l),k.setClearColor(ye,be),d!==void 0&&(r.viewport=d),k.toneMapping=u}function Et(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&Dt(o,t,n,s,l,c)}}function Dt(e,t,n,r,i,a){e.onBeforeRender(k,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(k,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=2):k.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(k,t,n,r,i,a)}function Ot(e,t,n){t.isScene!==!0&&(t=Fe);let r=N.get(e),i=T.state.lights,a=T.state.shadowsArray,o=i.state.version,s=Ke.getParameters(e,i.state,a,t,n,T.state.lightProbeGridArray),c=Ke.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=He.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,ht),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return At(e,s),d}else s.uniforms=Ke.getUniforms(e),ae!==null&&e.isNodeMaterial&&ae.build(e,n,s),e.onBeforeCompile(s,k),d=Ke.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Xe.uniform),At(e,s),r.needsLights=Pt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.lightProbeGrid=T.state.lightProbeGridArray.length>0,r.currentProgram=d,r.uniformsList=null,d}function kt(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=cu.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function At(e,t){let n=N.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function jt(e,t){if(e.length===0)return null;if(e.length===1)return e[0].texture===null?null:e[0];x.setFromMatrixPosition(t.matrixWorld);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n.texture!==null&&n.boundingBox.containsPoint(x))return n}return null}function Mt(e,t,n,r,i){t.isScene!==!0&&(t=Fe),P.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=A===null?k.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:V.workingColorSpace,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=He.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(h=k.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=N.get(r),y=T.state.lights;if(Ae===!0&&(je===!0||e!==he)){let t=e===he&&r.id===me;Xe.setState(r,e,t)}let b=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?b=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i.colorTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i.colorTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?b=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Xe.numPlanes||v.numIntersection!==Xe.numIntersection)?b=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h&&v.morphTargetsCount===_?!!v.lightProbeGrid!=T.state.lightProbeGridArray.length>0&&(b=!0):b=!0:b=!0:b=!0:(b=!0,v.__version=r.version);let x=v.currentProgram;b===!0&&(x=Ot(r,t,i),ae&&r.isNodeMaterial&&ae.onUpdateProgram(r,x,v));let S=!1,C=!1,w=!1,E=x.getUniforms(),D=v.uniforms;if(M.useProgram(x.program)&&(S=!0,C=!0,w=!0),r.id!==me&&(me=r.id,C=!0),v.needsLights){let e=jt(T.state.lightProbeGridArray,i);v.lightProbeGrid!==e&&(v.lightProbeGrid=e,C=!0)}if(S||he!==e){M.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),E.setValue(j,`projectionMatrix`,e.projectionMatrix),E.setValue(j,`viewMatrix`,e.matrixWorldInverse);let t=E.map.cameraPosition;t!==void 0&&t.setValue(j,Ne.setFromMatrixPosition(e.matrixWorld)),Be.logarithmicDepthBuffer&&E.setValue(j,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&E.setValue(j,`isOrthographic`,e.isOrthographicCamera===!0),he!==e&&(he=e,C=!0,w=!0)}if(v.needsLights&&(y.state.directionalShadowMap.length>0&&E.setValue(j,`directionalShadowMap`,y.state.directionalShadowMap,P),y.state.spotShadowMap.length>0&&E.setValue(j,`spotShadowMap`,y.state.spotShadowMap,P),y.state.pointShadowMap.length>0&&E.setValue(j,`pointShadowMap`,y.state.pointShadowMap,P)),i.isSkinnedMesh){E.setOptional(j,i,`bindMatrix`),E.setOptional(j,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),E.setValue(j,`boneTexture`,e.boneTexture,P))}i.isBatchedMesh&&(E.setOptional(j,i,`batchingTexture`),E.setValue(j,`batchingTexture`,i._matricesTexture,P),E.setOptional(j,i,`batchingIdTexture`),E.setValue(j,`batchingIdTexture`,i._indirectTexture,P),E.setOptional(j,i,`batchingColorTexture`),i._colorsTexture!==null&&E.setValue(j,`batchingColorTexture`,i._colorsTexture,P));let ee=n.morphAttributes;if((ee.position!==void 0||ee.normal!==void 0||ee.color!==void 0)&&et.update(i,n,x),(C||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,E.setValue(j,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(D.envMapIntensity.value=t.environmentIntensity),D.dfgLUT!==void 0&&(D.dfgLUT.value=kd()),C){if(E.setValue(j,`toneMappingExposure`,k.toneMappingExposure),v.needsLights&&Nt(D,w),a&&r.fog===!0&&qe.refreshFogUniforms(D,a),qe.refreshMaterialUniforms(D,r,Ce,Se,T.state.transmissionRenderTarget[e.id]),v.needsLights&&v.lightProbeGrid){let e=v.lightProbeGrid;D.probesSH.value=e.texture,D.probesMin.value.copy(e.boundingBox.min),D.probesMax.value.copy(e.boundingBox.max),D.probesResolution.value.copy(e.resolution)}cu.upload(j,kt(v),D,P)}if(r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(cu.upload(j,kt(v),D,P),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&E.setValue(j,`center`,i.center),E.setValue(j,`modelViewMatrix`,i.modelViewMatrix),E.setValue(j,`normalMatrix`,i.normalMatrix),E.setValue(j,`modelMatrix`,i.matrixWorld),r.uniformsGroups!==void 0){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];ot.update(n,x),ot.bind(n,x)}}return x}function Nt(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function Pt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return fe},this.getActiveMipmapLevel=function(){return pe},this.getRenderTarget=function(){return A},this.setRenderTargetTextures=function(e,t,n){let r=N.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),N.get(e.texture).__webglTexture=t,N.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=N.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0},this.setRenderTarget=function(e,t=0,n=0){A=e,fe=t,pe=n;let r=null,i=!1,a=!1;if(e){let o=N.get(e);if(o.__useDefaultFramebuffer!==void 0){M.bindFramebuffer(j.FRAMEBUFFER,o.__webglFramebuffer),ge.copy(e.viewport),_e.copy(e.scissor),ve=e.scissorTest,M.viewport(ge),M.scissor(_e),M.setScissorTest(ve),me=-1;return}else if(o.__webglFramebuffer===void 0)P.setupRenderTarget(e);else if(o.__hasExternalTextures)P.rebindTextures(e,N.get(e.texture).__webglTexture,N.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&N.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.`);P.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=N.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&P.useMultisampledRTT(e)===!1?N.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,ge.copy(e.viewport),_e.copy(e.scissor),ve=e.scissorTest}else ge.copy(Ee).multiplyScalar(Ce).floor(),_e.copy(De).multiplyScalar(Ce).floor(),ve=Oe;if(n!==0&&(r=oe),M.bindFramebuffer(j.FRAMEBUFFER,r)&&M.drawBuffers(e,r),M.viewport(ge),M.scissor(_e),M.setScissorTest(ve),i){let r=N.get(e.texture);j.framebufferTexture2D(j.FRAMEBUFFER,j.COLOR_ATTACHMENT0,j.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=N.get(e.textures[t]);j.framebufferTextureLayer(j.FRAMEBUFFER,j.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=N.get(e.texture);j.framebufferTexture2D(j.FRAMEBUFFER,j.COLOR_ATTACHMENT0,j.TEXTURE_2D,t.__webglTexture,n)}me=-1},this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){I(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=N.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){M.bindFramebuffer(j.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;if(e.textures.length>1&&j.readBuffer(j.COLOR_ATTACHMENT0+s),!Be.textureFormatReadable(c)){I(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(!Be.textureTypeReadable(l)){I(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&j.readPixels(t,n,r,i,it.convert(c),it.convert(l),a)}finally{let e=A===null?null:N.get(A).__webglFramebuffer;M.bindFramebuffer(j.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=N.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c)if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){M.bindFramebuffer(j.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;if(e.textures.length>1&&j.readBuffer(j.COLOR_ATTACHMENT0+s),!Be.textureFormatReadable(l))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(!Be.textureTypeReadable(u))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let d=j.createBuffer();j.bindBuffer(j.PIXEL_PACK_BUFFER,d),j.bufferData(j.PIXEL_PACK_BUFFER,a.byteLength,j.STREAM_READ),j.readPixels(t,n,r,i,it.convert(l),it.convert(u),0);let f=A===null?null:N.get(A).__webglFramebuffer;M.bindFramebuffer(j.FRAMEBUFFER,f);let p=j.fenceSync(j.SYNC_GPU_COMMANDS_COMPLETE,0);return j.flush(),await ft(j,p,4),j.bindBuffer(j.PIXEL_PACK_BUFFER,d),j.getBufferSubData(j.PIXEL_PACK_BUFFER,0,a),j.deleteBuffer(d),j.deleteSync(p),a}else throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;P.setTexture2D(e,0),j.copyTexSubImage2D(j.TEXTURE_2D,n,0,0,o,s,i,a),M.unbindTexture()},this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=it.convert(t.format),_=it.convert(t.type),v;t.isData3DTexture?(P.setTexture3D(t,0),v=j.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(P.setTexture2DArray(t,0),v=j.TEXTURE_2D_ARRAY):(P.setTexture2D(t,0),v=j.TEXTURE_2D),M.activeTexture(j.TEXTURE0),M.pixelStorei(j.UNPACK_FLIP_Y_WEBGL,t.flipY),M.pixelStorei(j.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),M.pixelStorei(j.UNPACK_ALIGNMENT,t.unpackAlignment);let y=M.getParameter(j.UNPACK_ROW_LENGTH),b=M.getParameter(j.UNPACK_IMAGE_HEIGHT),x=M.getParameter(j.UNPACK_SKIP_PIXELS),S=M.getParameter(j.UNPACK_SKIP_ROWS),C=M.getParameter(j.UNPACK_SKIP_IMAGES);M.pixelStorei(j.UNPACK_ROW_LENGTH,h.width),M.pixelStorei(j.UNPACK_IMAGE_HEIGHT,h.height),M.pixelStorei(j.UNPACK_SKIP_PIXELS,l),M.pixelStorei(j.UNPACK_SKIP_ROWS,u),M.pixelStorei(j.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=N.get(e),r=N.get(t),h=N.get(n.__renderTarget),g=N.get(r.__renderTarget);M.bindFramebuffer(j.READ_FRAMEBUFFER,h.__webglFramebuffer),M.bindFramebuffer(j.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(j.framebufferTextureLayer(j.READ_FRAMEBUFFER,j.COLOR_ATTACHMENT0,N.get(e).__webglTexture,i,d+n),j.framebufferTextureLayer(j.DRAW_FRAMEBUFFER,j.COLOR_ATTACHMENT0,N.get(t).__webglTexture,a,m+n)),j.blitFramebuffer(l,u,o,s,f,p,o,s,j.DEPTH_BUFFER_BIT,j.NEAREST);M.bindFramebuffer(j.READ_FRAMEBUFFER,null),M.bindFramebuffer(j.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||N.has(e)){let n=N.get(e),r=N.get(t);M.bindFramebuffer(j.READ_FRAMEBUFFER,se),M.bindFramebuffer(j.DRAW_FRAMEBUFFER,le);for(let e=0;e<c;e++)w?j.framebufferTextureLayer(j.READ_FRAMEBUFFER,j.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):j.framebufferTexture2D(j.READ_FRAMEBUFFER,j.COLOR_ATTACHMENT0,j.TEXTURE_2D,n.__webglTexture,i),T?j.framebufferTextureLayer(j.DRAW_FRAMEBUFFER,j.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):j.framebufferTexture2D(j.DRAW_FRAMEBUFFER,j.COLOR_ATTACHMENT0,j.TEXTURE_2D,r.__webglTexture,a),i===0?T?j.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):j.copyTexSubImage2D(v,a,f,p,l,u,o,s):j.blitFramebuffer(l,u,o,s,f,p,o,s,j.COLOR_BUFFER_BIT,j.NEAREST);M.bindFramebuffer(j.READ_FRAMEBUFFER,null),M.bindFramebuffer(j.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?j.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?j.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):j.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?j.texSubImage2D(j.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?j.compressedTexSubImage2D(j.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):j.texSubImage2D(j.TEXTURE_2D,a,f,p,o,s,g,_,h);M.pixelStorei(j.UNPACK_ROW_LENGTH,y),M.pixelStorei(j.UNPACK_IMAGE_HEIGHT,b),M.pixelStorei(j.UNPACK_SKIP_PIXELS,x),M.pixelStorei(j.UNPACK_SKIP_ROWS,S),M.pixelStorei(j.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&j.generateMipmap(v),M.unbindTexture()},this.initRenderTarget=function(e){N.get(e).__webglFramebuffer===void 0&&P.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?P.setTextureCube(e,0):e.isData3DTexture?P.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?P.setTexture2DArray(e,0):P.setTexture2D(e,0),M.unbindTexture()},this.resetState=function(){fe=0,pe=0,A=null,M.reset(),at.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return rt}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=V._getDrawingBufferColorSpace(e),t.unpackColorSpace=V._getUnpackColorSpace()}},jd=new z;function Md(e,t,n,r,i,a){let o=2*Math.PI*i/4,s=Math.max(a-2*i,0),c=Math.PI/4;jd.copy(t),jd[r]=0,jd.normalize();let l=.5*o/(o+s),u=1-jd.angleTo(e)/c;return Math.sign(jd[n])===1?u*l:s/(o+s)+l+l*(1-u)}var Nd=class e extends ba{constructor(e=1,t=1,n=1,r=2,i=.1){let a=r*2+1;if(i=Math.min(e/2,t/2,n/2,i),super(1,1,1,a,a,a),this.type=`RoundedBoxGeometry`,this.parameters={width:e,height:t,depth:n,segments:r,radius:i},a===1)return;let o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;let s=new z,c=new z,l=new z(e,t,n).divideScalar(2).subScalar(i),u=this.attributes.position.array,d=this.attributes.normal.array,f=this.attributes.uv.array,p=u.length/6,m=new z,h=.5/a;for(let r=0,a=0;r<u.length;r+=3,a+=2)switch(s.fromArray(u,r),c.copy(s),c.x-=Math.sign(c.x)*h,c.y-=Math.sign(c.y)*h,c.z-=Math.sign(c.z)*h,c.normalize(),u[r+0]=l.x*Math.sign(s.x)+c.x*i,u[r+1]=l.y*Math.sign(s.y)+c.y*i,u[r+2]=l.z*Math.sign(s.z)+c.z*i,d[r+0]=c.x,d[r+1]=c.y,d[r+2]=c.z,Math.floor(r/p)){case 0:m.set(1,0,0),f[a+0]=Md(m,c,`z`,`y`,i,n),f[a+1]=1-Md(m,c,`y`,`z`,i,t);break;case 1:m.set(-1,0,0),f[a+0]=1-Md(m,c,`z`,`y`,i,n),f[a+1]=1-Md(m,c,`y`,`z`,i,t);break;case 2:m.set(0,1,0),f[a+0]=1-Md(m,c,`x`,`z`,i,e),f[a+1]=Md(m,c,`z`,`x`,i,n);break;case 3:m.set(0,-1,0),f[a+0]=1-Md(m,c,`x`,`z`,i,e),f[a+1]=1-Md(m,c,`z`,`x`,i,n);break;case 4:m.set(0,0,1),f[a+0]=1-Md(m,c,`x`,`y`,i,e),f[a+1]=1-Md(m,c,`y`,`x`,i,t);break;case 5:m.set(0,0,-1),f[a+0]=Md(m,c,`x`,`y`,i,e),f[a+1]=1-Md(m,c,`y`,`x`,i,t);break}}static fromJSON(t){return new e(t.width,t.height,t.depth,t.segments,t.radius)}};function Pd(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new Vr,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=Fd(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=Fd(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function Fd(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new Er(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}var Id=e=>Math.min(1,Math.max(0,e)),Ld=(e,t=0)=>Number.isFinite(e)?e:t;function Rd(e,t,n,r){let i=Id(Ld(e)),a=Math.max(0,Ld(n)),o=r===`scattergun`?.32:r===`smg`?.1:.17;return Id(Math.max(0,i-a*.24)+(t?o:0))}function zd(e,t,n){let r=Math.max(0,Ld(t)),i=e===`smg`?44:e===`scattergun`?620:62,a=(1-Id(r/(e===`scattergun`?82:e===`smg`?36:52)))**2,o=Id((e===`scattergun`?Math.max(0,r-180):r)/(e===`scattergun`?440:i));return{flash:a,boltTravel:o>=1?0:Math.sin(o*Math.PI),smokeScale:.72+Id(Ld(n))*1.28,casingReady:r>=(e===`scattergun`?230:e===`smg`?24:34)}}function Bd(e,t){let n=Id(Math.max(0,Ld(e))/(t===`head`?260:320));if(n>=1)return{envelope:0,pitch:0,roll:0};let r=Math.sin(n*Math.PI)*(1-n*.32),i=t===`head`?1:t===`limb`?.62:.78;return{envelope:n>=1?0:r*i,pitch:(t===`head`?-.2:.12)*r*i,roll:(t===`limb`?.18:.1)*r*i}}var Vd=new Es,Hd=new Map,Ud={"grass-turf.png":7904597,"asphalt-aged.png":4937047,"concrete-poured.png":10921114,"brick-warm.png":11893598,"siding-aqua.png":5155495,"siding-coral.png":13004122,"weapon-gunmetal.png":4937050,"wood-deck.png":7885115,"roof-shingles.png":5856867};function Wd(e){let t=e,n=e.userData.batchColor,r=typeof n==`number`?new H(n):t.color?.clone()??new H(16777215);return t.emissive&&Math.max(t.emissive.r,t.emissive.g,t.emissive.b)>0&&r.lerp(t.emissive,Math.min(.5,(t.emissiveIntensity??0)*.35)),r}function Gd(e){let t=e;return JSON.stringify({type:e.type,color:t.color?.getHex(),emissive:t.emissive?.getHex(),emissiveIntensity:t.emissiveIntensity,roughness:t.roughness,metalness:t.metalness,transmission:t.transmission,map:t.map?.uuid,transparent:e.transparent,opacity:e.opacity,side:e.side,depthWrite:e.depthWrite,polygonOffset:e.polygonOffset,polygonOffsetFactor:e.polygonOffsetFactor})}function Kd(e,t,n=()=>``,r=`preserve`){let i=r!==`preserve`;e.updateWorldMatrix(!0,!0);let a=new Map;e.traverse(t=>{let o=(()=>{let n=t;for(;n&&n!==e.parent;){if(n.userData.dynamic===!0)return!0;n=n.parent}return!1})();if(!(t instanceof U)||!t.visible||o||t.userData.targetRoot||Array.isArray(t.material))return;let s=t.material,c=typeof HTMLCanvasElement<`u`&&s.map?.image instanceof HTMLCanvasElement;if(i&&c)return;let l=n(t),u=Wd(t.material),d=t.material.transparent?`t${t.material.opacity.toFixed(2)}`:`opaque`,f=i?`${u.getHexString()}:${d}:${l}`:`${Gd(t.material)}:${l}`,p=a.get(f);p||(p={material:r===`palette-basic`?new _i({color:u,toneMapped:!1,transparent:t.material.transparent,opacity:t.material.opacity,depthWrite:!t.material.transparent}):t.material,classification:l,meshes:[],geometries:[]},a.set(f,p));let m=t.geometry.clone();if(m.index){let e=m;m=m.toNonIndexed(),e.dispose()}if(m.applyMatrix4(t.matrixWorld),i)for(let e of Object.keys(m.attributes))e!==`position`&&m.deleteAttribute(e);p.meshes.push(t),p.geometries.push(m)});let o=new Rn;o.name=`${e.name||`static`}-render-batches`;let s=0,c=0;for(let e of a.values()){let t=Pd(e.geometries,!1);if(!t){e.geometries.forEach(e=>e.dispose());continue}let n=new U(t,e.material);e.classification&&(n.userData.hitZone=e.classification),n.castShadow=r===`preserve`&&e.meshes.some(e=>e.castShadow),n.receiveShadow=r===`preserve`&&e.meshes.some(e=>e.receiveShadow),n.frustumCulled=!0,o.add(n);for(let t of e.meshes)t.visible=!1;s+=e.meshes.length,c+=1}return t.add(o),{sourceMeshes:s,batches:c}}function qd(e,t=1,n=1){let r=`${e}:${t}:${n}`,i=Hd.get(r);if(i)return i;let a=Vd.load(e);return a.colorSpace=Ze,a.wrapS=a.wrapT=u,a.repeat.set(t,n),a.anisotropy=8,Hd.set(r,a),a}function Jd(e,t={}){let n=new W({map:qd(e,t.repeatX??1,t.repeatY??1),color:t.color??16777215,roughness:t.roughness??.78,metalness:t.metalness??.03}),r=Object.entries(Ud).find(([t])=>e.endsWith(t))?.[1]??16777215;return n.userData.batchColor=new H(r).multiply(new H(t.color??16777215)).getHex(),n}function q(e,t,n,r=.08,i=3){let a=new U(new Nd(t[0],t[1],t[2],i,Math.min(r,...t.map(e=>e/4))),n);return a.name=e,a.castShadow=!0,a.receiveShadow=!0,a}var Yd={gunmetal:()=>Jd(`./assets/original/textures/weapon-gunmetal.png`,{color:12107709,roughness:.38,metalness:.62,repeatX:2}),dark:()=>new W({color:2436145,roughness:.42,metalness:.5}),rubber:()=>new W({color:2106920,roughness:.9}),brass:()=>new W({color:12093500,roughness:.3,metalness:.76}),glass:()=>new rs({color:8703971,roughness:.12,metalness:.08,transparent:!0,opacity:.7}),cream:()=>new W({color:15195073,roughness:.68}),tealMetal:()=>Jd(`./assets/original/textures/painted-metal-teal.png`,{roughness:.54,metalness:.28,repeatX:3})};function J(e,t,n,r=[0,0,0]){return t.position.set(...n),t.rotation.set(...r),e.add(t),t}function Xd(e,t=!1){let n=new Rn;n.name=`${e}-original-weapon`;let r=Yd.gunmetal(),i=Yd.dark(),a=Yd.rubber(),o=new W({color:e===`carbine`?14068036:e===`smg`?4766135:12016965,roughness:.45,metalness:.35}),s=(e,t,r=n)=>{let i=new Ln;i.name=e,i.position.set(...t),r.add(i)},c=(e,t,r)=>{let a=new U(new Ca(r*.82,r,e,12),i);J(n,a,[0,.005,t],[Math.PI/2,0,0])};if(e===`carbine`){J(n,q(`receiver`,[.235,.22,.62],r,.035),[0,0,-.12]),J(n,q(`upper-receiver`,[.205,.095,.57],i,.025),[0,.115,-.13]);for(let e of[-1,1]){if(J(n,q(`receiver-side-panel`,[.022,.135,.43],i,.006,2),[e*.128,.015,-.16]),e<0){let r=t?[-.15]:[-.29,-.15,-.01];for(let t of r)J(n,q(`receiver-accent-stripe`,[.025,.045,.085],o,.006,1),[e*.141,.045,t],[0,0,-.18])}let r=new U(new Ca(.014,.014,.4,7),i);r.name=`stock-support-rod`,J(n,r,[e*.055,.035,.38],[Math.PI/2,e*.08,0])}J(n,q(`stock-cheek-rest`,[.18,.105,.3],a,.035),[0,.095,.36],[-.05,0,0]),J(n,q(`stock-shoulder-pad`,[.185,.23,.09],a,.035),[0,-.005,.56],[-.08,0,0]),J(n,q(`pistol-grip`,[.11,.255,.135],a,.025),[0,-.18,.055],[-.2,0,0]),J(n,q(`trigger-guard-front`,[.026,.125,.025],i,.006,1),[0,-.12,-.045],[.18,0,0]),J(n,q(`trigger-guard-bottom`,[.026,.025,.13],i,.006,1),[0,-.18,.01]),J(n,q(`trigger`,[.022,.09,.022],o,.005,1),[0,-.12,.01],[.25,0,0]);let e=new Rn;e.name=`curved-magazine`,e.position.set(0,-.24,-.17),e.rotation.x=.16,n.add(e),J(e,q(`magazine-body`,[.12,.35,.16],i,.032),[0,0,0]);let l=t?[.04]:[-.11,-.035,.04,.115];for(let t of l)J(e,q(`magazine-rib`,[.126,.018,.168],o,.005,1),[0,t,0]);J(e,q(`magazine-base`,[.14,.045,.18],a,.012,2),[0,-.185,.01]),s(`reload-socket-l`,[-.14,-.05,.04],e),J(n,q(`triangular-fore-end`,[.215,.16,.46],r,.032),[0,-.005,-.59]),J(n,q(`fore-end-top-rail`,[.19,.035,.52],i,.008,1),[0,.105,-.55]);for(let e of[-1,1]){J(n,q(`fore-end-side-rail`,[.028,.085,.34],i,.006,1),[e*.116,0,-.58]);let r=t?[-.61]:[-.72,-.61,-.5];for(let t of r)J(n,q(`fore-end-vent`,[.024,.052,.062],o,.006,1),[e*.123,.035,t])}let u=t?[-.64,-.46]:[-.73,-.64,-.55,-.46,-.37];for(let e of u)J(n,q(`rail-tooth`,[.18,.024,.035],i,.004,1),[0,.135,e]);c(.5,-.96,.031);let d=new U(new Ca(.052,.052,.095,10),i);d.name=`gas-block`,J(n,d,[0,.002,-.8],[Math.PI/2,0,0]),J(n,q(`optic-bridge`,[.155,.045,.34],i,.01),[0,.145,-.015]);for(let e of[-1,1])J(n,q(`optic-side-post`,[.026,.13,.11],i,.007,2),[e*.062,.202,-.025]);J(n,q(`optic-top-frame`,[.148,.026,.11],i,.007,2),[0,.268,-.025]);let f=new U(new Ko(.058,.01,8,20),i);f.name=`optic-ring`,f.position.set(0,.215,-.096),n.add(f);let p=new U(new Sa(.049,18),new _i({color:t?7324631:9165796,transparent:!0,opacity:t?.16:.22,depthWrite:!1,side:2}));p.name=`optic-lens`,p.position.set(0,.215,-.098),n.add(p);let m=new U(new Sa(.009,12),new _i({color:16765786,depthWrite:!1,toneMapped:!1}));m.name=`optic-reticle`,m.position.set(0,.215,.033),n.add(m),J(n,q(`rear-sight`,[.105,.07,.045],i,.01),[0,.19,.18]),J(n,q(`front-sight`,[.035,.105,.035],i,.006),[0,.17,-.78]),J(n,q(`charging-handle`,[.19,.035,.07],o,.008),[0,.13,.1]);let h=J(n,q(`bolt-or-slide`,[.052,.06,.18],Yd.brass(),.01),[.112,.035,-.045]);h.userData.restZ=h.position.z,s(`muzzle-socket`,[0,.005,-1.24]),s(`eject-socket`,[.145,.055,-.07]),s(`grip-socket-r`,[.035,-.135,.045]),s(`support-socket-l`,[-.035,-.085,-.58])}else if(e===`smg`){J(n,q(`receiver`,[.22,.225,.45],r,.04),[0,0,-.12]),J(n,q(`tall-rear-housing`,[.205,.25,.2],i,.035),[0,.075,.09]),J(n,q(`receiver-spine`,[.16,.045,.47],o,.01,2),[0,.145,-.1]),J(n,q(`heat-shield`,[.225,.145,.34],o,.025),[0,.005,-.48]);let e=t?[-.48]:[-.59,-.51,-.43,-.35];for(let t of[-1,1])for(let r of e){let e=new U(new Ko(.028,.008,6,12),i);e.name=`smg-heat-vent`,e.rotation.y=Math.PI/2,e.position.set(t*.119,.012,r),n.add(e)}J(n,q(`raked-grip`,[.11,.255,.13],a,.025),[0,-.18,.015],[-.24,0,0]),J(n,q(`trigger-bridge`,[.12,.025,.13],i,.006,1),[0,-.12,-.025]);let l=new Rn;l.name=`straight-magazine`,l.position.set(0,-.26,-.1),l.rotation.x=-.08,n.add(l),J(l,q(`smg-magazine-body`,[.13,.31,.14],i,.025),[0,0,0]);let u=t?[0]:[-.095,0,.095];for(let e of u)J(l,q(`magazine-witness`,[.136,.035,.025],o,.006,1),[0,e,-.072]);J(l,q(`smg-mag-base`,[.15,.045,.155],a,.012,2),[0,-.17,0]),s(`reload-socket-l`,[-.14,-.08,.02],l);for(let e of[-.065,.065]){let t=new U(new Ca(.012,.012,.36,8),i);t.name=`smg-stock-rod`,J(n,t,[e,.015,.35],[Math.PI/2,0,0])}J(n,q(`wire-stock-pad`,[.18,.19,.08],a,.025),[0,.015,.54]),c(.27,-.71,.035);let d=new U(new Ca(.055,.048,.13,10),i);d.name=`muzzle-brake`,J(n,d,[0,.005,-.87],[Math.PI/2,0,0]);let f=J(n,q(`bolt-or-slide`,[.22,.055,.11],o,.012),[0,.135,-.035]);f.userData.restZ=f.position.z,J(n,q(`charging-tab`,[.07,.035,.09],o,.008,2),[.145,.105,-.035]);let p=new U(new Ko(.045,.009,7,18),i);p.name=`smg-aperture`,p.position.set(0,.24,.09),n.add(p),J(n,q(`smg-front-post`,[.028,.12,.028],i,.006),[0,.11,-.57]),s(`muzzle-socket`,[0,.005,-.96]),s(`eject-socket`,[.14,.06,-.04]),s(`grip-socket-r`,[.03,-.13,.02]),s(`support-socket-l`,[-.03,-.08,-.43])}else{let e=new W({color:12159575,roughness:.78,metalness:.04});J(n,q(`rounded-receiver`,[.225,.225,.5],r,.055),[0,0,-.05]),J(n,q(`receiver-topstrap`,[.17,.045,.47],i,.012,2),[0,.135,-.05]),J(n,q(`stock`,[.18,.205,.5],e,.06),[0,-.015,.42],[-.05,0,0]),J(n,q(`stock-cheek-panel`,[.19,.08,.3],o,.025,2),[0,.085,.38]),J(n,q(`grip`,[.115,.25,.14],a,.03),[0,-.19,.13],[-.2,0,0]),c(.9,-.76,.042);let l=new U(new Ca(.035,.039,.74,12),r);l.name=`magazine-tube`,J(n,l,[0,-.075,-.7],[Math.PI/2,0,0]);let u=new U(new Ca(.049,.049,.08,10),o);u.name=`tube-cap`,J(n,u,[0,-.075,-1.08],[Math.PI/2,0,0]);let d=J(n,q(`barrel-heat-shield`,[.16,.055,.68],i,.014,2),[0,.082,-.72]);d.userData.presentationOnly=!0;let f=t?[-.72]:[-.94,-.82,-.7,-.58,-.46];for(let e of f)J(n,q(`heat-shield-vent`,[.11,.02,.055],o,.005,1),[0,.115,e]);let p=new Rn;p.name=`pump`,p.position.set(0,-.055,-.49),p.userData.restZ=p.position.z,n.add(p),J(p,q(`pump-body`,[.205,.17,.35],e,.05),[0,0,0]);let m=t?[0]:[-.12,-.06,0,.06,.12];for(let e of m)J(p,q(`pump-rib`,[.215,.025,.018],i,.004,1),[0,.035,e]);let h=new U(new Ko(.04,.009,7,18),i);h.name=`ghost-ring`,h.position.set(0,.2,.11),n.add(h);let g=new U(new Go(.018,10,8),o);g.name=`front-bead`,g.position.set(0,.06,-1.12),n.add(g);let _=q(`loading-port`,[.12,.025,.18],i,.006,1);_.position.set(0,-.125,-.02),n.add(_);let v=new Rn;v.name=`shell-saddle`,v.position.set(-.135,.02,-.04),n.add(v);let y=t?[0]:[-.09,0,.09];for(let e of y){let t=new U(new Ca(.022,.022,.105,8),new W({color:11812658,roughness:.58,metalness:.18}));t.name=`saddle-shell`,t.rotation.x=Math.PI/2,t.position.z=e,v.add(t)}let b=new U(new Ca(.024,.024,.105,8),new W({color:11812658,roughness:.58,metalness:.18}));b.name=`reload-shell`,b.rotation.z=Math.PI/2,b.position.set(-.16,-.13,-.02),b.visible=!1,n.add(b),s(`reload-socket-l`,[-.18,-.14,.02]),s(`muzzle-socket`,[0,.005,-1.24]),s(`eject-socket`,[.14,.045,-.03]),s(`grip-socket-r`,[.03,-.14,.12]),s(`support-socket-l`,[-.03,-.025,0],p)}let l=new U(new Ca(.055,.045,.1,12),i),u=n.getObjectByName(`muzzle-socket`);if(u){l.rotation.x=Math.PI/2,l.position.copy(u.position),l.userData.muzzle=!0,n.add(l);let t=new U(new wa(e===`scattergun`?.12:.075,e===`scattergun`?.42:.28,7),new _i({color:16762477,transparent:!0,opacity:.88,depthWrite:!1}));t.name=`world-muzzle-flash`,t.rotation.x=-Math.PI/2,t.position.copy(u.position).add(new z(0,0,-.18)),t.visible=!1,n.add(t)}if(t&&e===`carbine`){let e=new Set([`receiver-side-panel`,`receiver-accent-stripe`,`stock-support-rod`,`trigger-guard-front`,`trigger-guard-bottom`,`trigger`,`fore-end-side-rail`,`fore-end-vent`,`rail-tooth`,`gas-block`,`rear-sight`,`front-sight`,`charging-handle`,`bolt-or-slide`]);n.traverse(t=>{e.has(t.name)&&(t.visible=!1)})}return n.traverse(e=>{e instanceof U&&(e.castShadow=!0,e.receiveShadow=!1)}),n}function Zd(e,t,n,r){let i=new U(new Ca(r,r,.42,24),Yd.rubber());i.rotation.z=Math.PI/2,i.position.set(t,r,n),i.castShadow=!0;let a=new U(new Ca(r*.44,r*.44,.46,20),Yd.brass());a.rotation.z=Math.PI/2,a.position.copy(i.position),e.add(i,a)}function Qd(e,t,n){let r=document.createElement(`canvas`);r.width=512,r.height=128;let i=r.getContext(`2d`);i.fillStyle=`#173039`,i.fillRect(0,0,r.width,r.height),i.strokeStyle=`#e6b84b`,i.lineWidth=12,i.strokeRect(8,8,496,112),i.fillStyle=`#f4ead2`,i.font=`900 58px sans-serif`,i.textAlign=`center`,i.textBaseline=`middle`,i.fillText(e,256,67);let a=new ga(r);return a.colorSpace=Ze,new U(new Ho(t,n),new _i({map:a,polygonOffset:!0,polygonOffsetFactor:-2}))}function $d(){let e=new Rn;e.name=`original-atomic-coach`,J(e,q(`coach-body`,[5.3,3.45,13.6],new W({color:13671218,roughness:.48,metalness:.25}),.38,5),[0,2.02,0]),J(e,q(`coach-lower`,[5.42,.72,13.2],Yd.tealMetal(),.2),[0,.78,0]),J(e,q(`coach-roof`,[5.08,.34,12.8],Yd.cream(),.16),[0,3.88,0]);let t=Yd.glass();for(let n of[-1,1])for(let r=-4.8;r<=4.8;r+=2.4)J(e,q(`coach-window`,[.055,1.34,1.85],t,.08),[n*2.67,2.68,r]);J(e,q(`windshield`,[4.28,1.36,.08],t,.09),[0,2.64,-6.82],[-.08,0,0]),J(e,q(`rear-glass`,[4.18,1.18,.08],t,.09),[0,2.64,6.82]);for(let t of[-1.8,1.8])for(let n of[-4.6,4.6])Zd(e,t,n,.74);for(let t of[-1.75,1.75]){let n=new U(new Sa(.26,20),new W({color:16773298,emissive:16758861,emissiveIntensity:2.3}));n.position.set(t,1.55,-6.88),e.add(n)}let n=Qd(`ATOM-LINER 86`,3.6,.9);return n.position.set(0,3.25,-6.9),e.add(n),e}function ef(){let e=new Rn;e.name=`original-delivery-truck`,J(e,q(`cargo-body`,[4.9,3.75,7.4],Yd.tealMetal(),.24,5),[0,2.35,1.3]),J(e,q(`cab`,[4.7,2.95,3.5],Yd.cream(),.34,5),[0,1.75,-4.05]),J(e,q(`windscreen`,[3.55,1.05,.07],Yd.glass(),.08),[0,2.5,-5.82],[-.08,0,0]);for(let t of[-1,1])J(e,q(`cab-side-window`,[.06,.9,1.35],Yd.glass(),.08),[t*2.37,2.45,-4.2]);for(let t of[-1.7,1.7])for(let n of[-3.55,2.7])Zd(e,t,n,.68);J(e,q(`front-bumper`,[4.9,.35,.35],Yd.dark(),.08),[0,.72,-5.92]);let t=Qd(`ACRES SUPPLY`,3.5,.85);return t.position.set(0,2.65,5.02),t.rotation.y=Math.PI,e.add(t),e}function tf(e){return e.userData.operatorRig}function nf(e,t,n=!1){let r=tf(e);if(!r||r.weaponId===t&&r.weapon)return;r.weapon&&r.weaponSocket.remove(r.weapon);let i=Xd(t,n);i.name=`operator-${t}`,i.scale.setScalar(t===`smg`?.72:.68),i.rotation.y=Math.PI,i.traverse(e=>{e instanceof U&&(e.userData.presentationOnly=!0,e.raycast=()=>void 0)}),r.weaponSocket.add(i),r.weapon=i,r.weaponId=t}function rf(e){e.userData.operatorShotAt=performance.now();let t=tf(e);if(t?.weapon){let e=t.weapon.getObjectByName(`world-muzzle-flash`);e&&(e.visible=!0)}}function af(e,t){e.userData.operatorHitAt=performance.now(),e.userData.operatorHitZone=t,e.userData.operatorHitSign=Number(e.userData.operatorHitSign??-1)*-1}function of(e,t,n,r,i=1,a=0){let o=tf(e);if(!o)return;let s=performance.now()-Number(e.userData.operatorShotAt??-1e4),c=s<180?Math.sin(s/180*Math.PI):0,l=performance.now()-Number(e.userData.operatorHitAt??-1e4),u=e.userData.operatorHitZone,d=Bd(l,u===`head`||u===`limb`?u:`body`),f=Number(e.userData.operatorHitSign??1);o.weaponSocket.position.x=d.roll*f*.18,o.weaponSocket.position.z=-.36+c*.11+d.envelope*.055,o.weaponSocket.rotation.x=-c*.12+d.pitch,o.weaponSocket.rotation.z=d.roll*f,o.reactionRoot.rotation.x=d.pitch*.72,o.reactionRoot.rotation.z=d.roll*f*.85;let p=o.weapon?.getObjectByName(o.weaponId===`scattergun`?`pump`:`bolt-or-slide`);if(p){let e=Number(p.userData.restZ??p.position.z),t=o.weaponId===`scattergun`?180:0,n=o.weaponId===`scattergun`?440:o.weaponId===`smg`?44:62,r=Bt.clamp((s-t)/n,0,1);p.position.z=e+Math.sin(r*Math.PI)*(o.weaponId===`scattergun`?.22:.08)}let m=o.weapon?.getObjectByName(`world-muzzle-flash`);m&&(m.visible=s>=0&&s<55);let h=Math.sin(r)*Math.min(1,n/4.8),g=t===`crouch`,_=t===`prone`,v=(e,t)=>Bt.lerp(e,t,i);o.hitProxyRoot.position.y=_?.52:g?-.28:0,o.hitProxyRoot.rotation.x=_?-Math.PI/2:0,o.pelvis.position.y=v(o.pelvis.position.y,_?.38:g?.67:.9),o.pelvis.rotation.x=v(o.pelvis.rotation.x,_?-1.08:0),o.spine.rotation.x=v(o.spine.rotation.x,_?-.24:g?.13:a*.28),o.leftThigh.rotation.x=v(o.leftThigh.rotation.x,_?-1.22+h*.12:g?-.7+h*.18:h*.48),o.rightThigh.rotation.x=v(o.rightThigh.rotation.x,_?-1.22-h*.12:g?-.7-h*.18:-h*.48),o.leftShin.rotation.x=v(o.leftShin.rotation.x,_?1.32:g?1.15:Math.max(0,-h)*.32),o.rightShin.rotation.x=v(o.rightShin.rotation.x,_?1.32:g?1.15:Math.max(0,h)*.32);let y=_?-1.05:-.72+a*.45;o.leftUpperArm.rotation.x=v(o.leftUpperArm.rotation.x,y-h*.08),o.rightUpperArm.rotation.x=v(o.rightUpperArm.rotation.x,y+h*.08),o.leftUpperArm.rotation.z=v(o.leftUpperArm.rotation.z,-.54),o.rightUpperArm.rotation.z=v(o.rightUpperArm.rotation.z,.45),o.leftForearm.rotation.x=v(o.leftForearm.rotation.x,-1.08),o.rightForearm.rotation.x=v(o.rightForearm.rotation.x,-1.22)}function sf(e,t=`operator`,n=!1,r=`carbine`){let i=new Rn;i.name=t,i.userData.dynamic=!0;let a=e===0?5626066:16741470,o=new W({color:a,emissive:e===0?740427:5903887,emissiveIntensity:.24,roughness:.68}),s=new W({color:a,emissive:a,emissiveIntensity:.72,roughness:.46}),c=Yd.dark(),l=new W({color:13212536,roughness:.82}),u=(e,t,n)=>{let r=new Rn;return r.name=t,r.position.set(...n),e.add(r),r},d=(e,t,n,r,i)=>{let a=q(t,n,i,Math.min(...n)*.3,3);return a.position.y=r,a.userData.hitZone=`limb`,e.add(a),a},f=e=>(e.userData.presentationOnly=!0,e.raycast=()=>void 0,e),p=u(i,`pelvis-joint`,[0,.9,0]),m=q(`pelvis-armour`,[.5,.28,.32],c,.08,3);m.userData.hitZone=`body`,p.add(m);let h=u(p,`spine-joint`,[0,.18,0]),g=q(`torso`,[.66,.72,.35],o,.13,4);g.position.y=.38,g.userData.hitZone=`body`,h.add(g);let _=q(`chest-armour`,[.71,.48,.41],c,.08,3);_.position.set(0,.4,-.04),_.userData.hitZone=`body`,h.add(_);let v=q(`team-identifier`,[.74,.085,.43],s,.02,2);v.position.set(0,e===0?.55:.42,-.06),v.rotation.z=e===0?0:-.28,v.userData.hitZone=`body`,h.add(v);let y=u(h,`presentation-reaction-gear`,[0,0,0]);if(n)for(let e of[`field-radio-pack`,`asymmetric-shoulder-plate`,`utility-pouch`,`team-radio-antenna`]){let t=new Rn;t.name=e,y.add(t)}else{let t=f(q(`field-radio-pack`,[.42,.48,.18],c,.06,2));t.position.set(e===0?-.07:.07,.38,.25),y.add(t);let n=f(q(`asymmetric-shoulder-plate`,[.3,.13,.34],s,.035,2));n.position.set(e===0?-.44:.44,.67,0),n.rotation.z=e===0?-.12:.12,y.add(n);let r=f(q(`utility-pouch`,[.2,.22,.13],o,.035,2));r.position.set(e===0?.24:-.24,.05,-.21),y.add(r);let i=f(new U(new Ca(.012,.012,.5,6),s));i.name=`team-radio-antenna`,i.position.set(e===0?-.16:.16,.78,.22),i.rotation.z=e===0?-.12:.12,y.add(i)}let b=u(h,`neck-joint`,[0,.81,0]),x=new U(new Go(.225,16,12),l);x.position.y=.18,x.userData.hitZone=`head`,x.castShadow=!0,b.add(x);let S=new U(new Go(.255,16,9,0,Math.PI*2,0,Math.PI*.58),c);S.position.y=.24,S.userData.hitZone=`head`,b.add(S);let C=q(`visor`,[.36,.1,.06],s,.025,2);C.position.set(0,.2,-.2),C.userData.hitZone=`head`,b.add(C);let w=[],T=[],E=[],D=[];for(let e of[-1,1]){let t=u(h,e<0?`left-upper-arm-joint`:`right-upper-arm-joint`,[e*.42,.66,0]);d(t,`upper-arm`,[.19,.42,.21],-.2,o);let n=u(t,e<0?`left-elbow-joint`:`right-elbow-joint`,[0,-.4,0]);d(n,`forearm`,[.17,.38,.19],-.18,c);let r=q(`hand`,[.18,.2,.18],c,.065,3);r.position.y=-.4,r.userData.hitZone=`limb`,n.add(r);let i=u(p,e<0?`left-thigh-joint`:`right-thigh-joint`,[e*.17,-.12,0]);d(i,`thigh`,[.24,.49,.28],-.23,o);let a=u(i,e<0?`left-knee-joint`:`right-knee-joint`,[0,-.47,0]);d(a,`shin`,[.22,.48,.25],-.22,c);let s=q(`foot`,[.23,.16,.38],c,.055,3);s.position.set(0,-.49,-.08),s.userData.hitZone=`limb`,a.add(s),w.push(t),T.push(n),E.push(i),D.push(a)}let ee=e===0?new U(new Ca(.1,.1,.08,14),s):new U(new wa(.13,.2,3),s);ee.name=`team-shoulder-beacon`,ee.position.set(e===0?-.44:.44,.7,0),ee.rotation.z=Math.PI/2,ee.userData.hitZone=`body`,h.add(ee);let te=u(h,`weapon-socket`,[.22,.43,-.36]),O=new Rn;O.name=`authoritative-hit-proxies`,i.add(O);let ne=new _i({color:16777215,colorWrite:!1,depthWrite:!1}),re=(e,t,n,r)=>{let i=new U(new ba(...n),ne);i.name=e,i.position.set(...r),i.visible=!1,i.userData.hitZone=t,i.userData.authoritativeProxy=!0,O.add(i)};re(`hit-proxy-body`,`body`,[.72,1.02,.5],[0,1.38,0]),re(`hit-proxy-head`,`head`,[.52,.52,.52],[0,2.13,0]),re(`hit-proxy-left-arm`,`limb`,[.3,1.08,.35],[-.5,1.35,0]),re(`hit-proxy-right-arm`,`limb`,[.3,1.08,.35],[.5,1.35,0]),re(`hit-proxy-left-leg`,`limb`,[.32,.95,.38],[-.18,.48,0]),re(`hit-proxy-right-leg`,`limb`,[.32,.95,.38],[.18,.48,0]);let k={pelvis:p,spine:h,leftUpperArm:w[0],rightUpperArm:w[1],leftForearm:T[0],rightForearm:T[1],leftThigh:E[0],rightThigh:E[1],leftShin:D[0],rightShin:D[1],weaponSocket:te,reactionRoot:y,hitProxyRoot:O,weaponId:r};return i.userData.operatorRig=k,nf(i,r,n),of(i,`stand`,0,0,1),i.traverse(e=>{e.userData.targetRoot=i,e instanceof U&&e.userData.hitZone&&e.userData.authoritativeProxy!==!0&&(e.userData.presentationOnly=!0,e.raycast=()=>void 0)}),i}var cf=Object.freeze({minX:-34,maxX:34,minZ:-43,maxZ:43}),lf=Object.freeze([Object.freeze({team:0,x:-9,z:-28,facing:1}),Object.freeze({team:1,x:9,z:28,facing:-1})]),uf=Object.freeze([Object.freeze({x:12,z:-36.5}),Object.freeze({x:-12,z:36.5})]),df=Object.freeze([[-13,-11,3.5,2],[13,11,3.5,2],[-15,4,3,3],[15,-4,3,3],[-21,17,4,2],[21,-17,4,2],[-24,-4,3,5],[24,4,3,5]]),ff=Object.freeze({0:Object.freeze([[-20,-30],[4,-33],[-17,-21],[17,-21]]),1:Object.freeze([[7,36],[-4,33],[17,21],[-17,21]])}),pf=Object.freeze([[-22,-10],[-16,13],[-4,20],[7,13],[19,7],[17,-15],[2,-20],[-11,-15]]);function mf(e){return(Number.isFinite(e.nearestThreatDistanceSq)?Math.min(1e6,Math.max(0,e.nearestThreatDistanceSq)):0)-Math.max(0,e.visibleThreats)*1e9-(e.occupied?0xe8d4a51000:0)+ +!!e.preferred}function hf(e,t,n){return e&&t>=n}function gf(e,t,n=0){if(e.length===0)return t;let r=e.map(e=>{let r=Math.max(0,e.distanceFromBot)*.42,i=Math.abs(Math.max(0,e.distanceFromPlayer)-13)*.34,a=e.seesPlayer?7:0,o=e.index===t?-4:.8,s=(e.index*17+n*7)%11*.001;return{index:e.index,score:a+o+s-r-i}});return r.sort((e,t)=>t.score-e.score||e.index-t.index),r[0].index}function _f(e){let t=Math.max(0,Math.min(1,(e-6)/16));return .024+t*t*.076}function vf(e){if(!e.alive)return{movement:`idle`,fire:!1,changeWaypoint:!1};let t=e.hasLineOfSight&&e.now-(e.lineOfSightSince??e.now)>=(e.reactionDelay??0),n=(e.burstShotsRemaining??0)>0?135:620,r=t&&e.distanceToPlayer<=22&&e.distanceToPlayer>=2.5&&e.now-e.lastShotAt>=n,i;return i=e.health<35&&e.hasLineOfSight&&e.distanceToPlayer<18||e.distanceToPlayer<5.5?`retreat`:!e.hasLineOfSight||e.distanceToPlayer>18?`advance`:e.random<.5?`strafe-right`:`strafe-left`,{movement:i,fire:r,changeWaypoint:e.waypointReached||!e.hasLineOfSight&&e.random>.88}}function yf(e){return{health:100,alive:!0,invulnerableUntil:e+1e3,lastShotAt:0}}var bf=new Set([`metal`,`concrete`,`wood`,`soil`]);function xf(e){if(typeof e.hint==`string`&&bf.has(e.hint))return e.hint;let t=(e.name??``).toLowerCase();return/(metal|steel|chrome|vehicle|coach|truck|hydrant|mailbox|barrier|fence post|utility|tower)/.test(t)?`metal`:/(wood|timber|deck|tree|trunk|branch|fence)/.test(t)?`wood`:/(grass|ground|soil|garden|planter|shrub|hedge)/.test(t)?`soil`:typeof e.metalness==`number`&&e.metalness>=.42?`metal`:`concrete`}function Sf(e,t,n){let r=n.x-t.x,i=n.y-t.y,a=n.z-t.z,o=e.x-t.x,s=e.y-t.y,c=e.z-t.z,l=r*r+i*i+a*a,u=l<=1e-9?0:Math.min(1,Math.max(0,(o*r+s*i+c*a)/l)),d=t.x+r*u-e.x,f=t.y+i*u-e.y,p=t.z+a*u-e.z;return Math.hypot(d,f,p)}function Cf(e,t,n){let r=Sf(e,t,n);return r<.6||r>2.6?0:Math.min(1,Math.max(0,1-(r-.6)/2))}function wf(e){if(![e.x,e.y,e.z].every(Number.isFinite))return`soil`;for(let t of lf){let n=Math.abs(e.x-t.x),r=Math.abs(e.z-t.z);if(e.y>3.05&&n<=8.1&&r<=7.1)return`wood`;let i=t.z-t.facing*9.2;if(n<=5&&Math.abs(e.z-i)<=1.8&&e.y<1.4)return`wood`}let t=Math.abs(e.x);return t<=9.5?`asphalt`:t<=14.2?`concrete`:`soil`}var Tf=[{id:`balanced`,title:`Linekeeper`,weapon:`carbine`,role:`CONTROL / MID RANGE`,summary:`Stable automatic pressure with the cleanest sight picture.`,traits:[`Range 4`,`Control 4`,`Mobility 3`]},{id:`runner`,title:`Circuit Runner`,weapon:`smg`,role:`MOBILITY / CLOSE RANGE`,summary:`Fast handling and dense close-range fire for side routes.`,traits:[`Range 2`,`Control 3`,`Mobility 5`]},{id:`breacher`,title:`Doorbreaker`,weapon:`scattergun`,role:`BURST / VERY CLOSE`,summary:`Heavy short-range impact with a deliberate pump cycle.`,traits:[`Range 1`,`Control 2`,`Mobility 3`]}],Ef=`balanced`,Df=`atomic-acres.field-kit.v1`;function Of(e){return Tf.find(t=>t.id===e)??Tf.find(e=>e.id===`balanced`)}function kf(e){if(!e)return Ef;try{let t=JSON.parse(e);return t.version===1?Of(t.selected).id:Ef}catch{return Ef}}function Af(e){return JSON.stringify({version:1,selected:Of(e).id})}var jf=class{context=null;master=null;weapons=null;feedback=null;movement=null;ambience=null;noiseBuffer=null;stepVariant=0;ambienceStarted=!1;lastNearMissAt=-1e4;arenaZone=null;lastZoneCueAt=-1e4;unlock(){if(!this.context){this.context=new AudioContext;let e=this.context.createDynamicsCompressor();e.threshold.value=-12,e.knee.value=8,e.ratio.value=6,e.attack.value=.002,e.release.value=.18,this.master=this.context.createGain(),this.master.gain.value=.34,this.master.connect(e).connect(this.context.destination),this.weapons=this.createBus(.78),this.feedback=this.createBus(.5),this.movement=this.createBus(.34),this.ambience=this.createBus(.16),this.noiseBuffer=this.createNoiseBuffer(1.2),this.startAmbience()}this.context.state===`suspended`&&this.context.resume()}startAmbience(){if(this.ambienceStarted||!this.context||!this.ambience||!this.noiseBuffer)return;this.ambienceStarted=!0;let e=this.context.createBufferSource(),t=this.context.createBiquadFilter(),n=this.context.createGain();e.buffer=this.noiseBuffer,e.loop=!0,e.loopStart=.1,e.loopEnd=1.1,t.type=`bandpass`,t.frequency.value=480,t.Q.value=.45,n.gain.value=.055,e.connect(t).connect(n).connect(this.ambience),e.start();let r=this.context.createOscillator(),i=this.context.createGain();r.type=`sine`,r.frequency.value=58,i.gain.value=.012,r.connect(i).connect(this.ambience),r.start()}setArenaZone(e){if(!this.context||!this.ambience){this.arenaZone=null;return}if(e===this.arenaZone)return;this.arenaZone=e;let t=e===`central-transit`?.2:e===`east-service`?.18:e===`west-garden`?.145:.16;this.ambience.gain.cancelScheduledValues(this.context.currentTime),this.ambience.gain.linearRampToValueAtTime(t,this.context.currentTime+.45);let n=performance.now();if(n-this.lastZoneCueAt<1200)return;this.lastZoneCueAt=n;let r=e===`east-service`?720:e===`west-garden`?330:e===`central-transit`?510:420;this.tone(r,.12,.018,`sine`,this.ambience),this.tone(r*1.5,.08,.012,`triangle`,this.ambience,.09)}shot(e,t=!1,n=0){if(this.unlock(),!this.context||!this.weapons)return;let r=t?Math.max(.08,.55*(1-Math.min(1,n/80))):1,i=e===`scattergun`?{body:78,bodyEnd:34,duration:.22,crack:1120,noise:.34,lowpass:1900,tail:410,tailDuration:.3}:e===`smg`?{body:156,bodyEnd:68,duration:.085,crack:2100,noise:.16,lowpass:3600,tail:760,tailDuration:.12}:{body:116,bodyEnd:46,duration:.13,crack:1750,noise:.23,lowpass:2900,tail:560,tailDuration:.19};if(this.sweep(i.body,i.bodyEnd,i.duration,.22*r,`sawtooth`,this.weapons),this.sweep(i.crack,i.crack*.38,.035,.075*r,`square`,this.weapons),this.noise({duration:i.duration,volume:i.noise*r,filter:`lowpass`,frequency:i.lowpass,q:.7},this.weapons),this.noise({duration:.028,volume:.17*r,filter:`highpass`,frequency:e===`scattergun`?1400:2400,q:.4},this.weapons),this.noise({duration:i.tailDuration,volume:(t?.055:.082)*r,filter:`bandpass`,frequency:i.tail,q:.48,delay:.025},this.ambience),e===`carbine`&&(this.sweep(74,38,.16,.052*r,`triangle`,this.weapons,.008),this.noise({duration:.14,volume:.046*r,filter:`bandpass`,frequency:830,q:.62,delay:.058},this.ambience),t||this.noise({duration:.022,volume:.046,filter:`highpass`,frequency:4200,q:.55,delay:.043},this.feedback)),!t){let t=e===`scattergun`?.21:.055;this.tone(e===`scattergun`?340:520,.028,.038,`square`,this.feedback,t),this.tone(e===`smg`?680:430,.018,.022,`triangle`,this.feedback,t+.025)}}hit(e=!1){this.tone(e?1260:910,.045,e?.11:.075,`sine`,this.feedback),this.tone(e?1840:1320,.028,e?.07:.035,`triangle`,this.feedback,.018)}kill(){this.tone(510,.06,.055,`triangle`,this.feedback),this.tone(760,.075,.07,`sine`,this.feedback,.045),this.tone(1040,.09,.075,`sine`,this.feedback,.095)}damage(){this.noise({duration:.11,volume:.075,filter:`bandpass`,frequency:520,q:1.2},this.feedback),this.sweep(110,72,.14,.055,`sine`,this.feedback)}impact(e,t=0){let n=Math.max(.08,1-Math.min(1,t/34)),r=e===`metal`?{frequency:3150,tone:960,duration:.065,volume:.09}:e===`wood`?{frequency:980,tone:240,duration:.075,volume:.07}:e===`soil`?{frequency:460,tone:120,duration:.09,volume:.062}:{frequency:1780,tone:410,duration:.07,volume:.076};this.noise({duration:r.duration,volume:r.volume*n,filter:`bandpass`,frequency:r.frequency,q:1.25},this.feedback),this.tone(r.tone,.028,.03*n,e===`metal`?`square`:`triangle`,this.feedback,.006)}coverImpact(e=0){this.impact(`concrete`,e)}nearMiss(e){let t=performance.now();if(e<=0||t-this.lastNearMissAt<85)return;this.lastNearMissAt=t;let n=Math.min(1,Math.max(.1,e));this.sweep(5200,1350,.085,.055*n,`sawtooth`,this.feedback),this.noise({duration:.11,volume:.045*n,filter:`highpass`,frequency:2600,q:.85,delay:.008},this.feedback)}weaponAction(e,t){let n=e===`scattergun`;t===`mag-release`?this.tone(620,.018,.028,`square`,this.feedback):t===`mag-out`?this.noise({duration:.055,volume:.032,filter:`bandpass`,frequency:1050,q:.9},this.feedback):t===`mag-in`?this.noise({duration:.06,volume:.038,filter:`bandpass`,frequency:1320,q:1.1},this.feedback):t===`mag-seat`?(this.tone(e===`smg`?470:390,.035,.052,`square`,this.feedback),this.noise({duration:.025,volume:.028,filter:`highpass`,frequency:2400,q:.8},this.feedback)):t===`shell-insert`?(this.tone(740,.02,.034,`triangle`,this.feedback),this.tone(260,.028,.03,`square`,this.feedback,.015)):t===`bolt-release`&&(this.tone(n?310:520,.034,.055,`square`,this.feedback),this.noise({duration:.032,volume:.036,filter:`highpass`,frequency:n?1200:1900,q:.75},this.feedback))}empty(){this.tone(170,.025,.055,`square`,this.feedback),this.tone(112,.035,.04,`triangle`,this.feedback,.03)}reload(){this.noise({duration:.07,volume:.026,filter:`bandpass`,frequency:720,q:.7},this.feedback)}weaponSwitch(){this.noise({duration:.07,volume:.026,filter:`bandpass`,frequency:760,q:.8},this.feedback),this.tone(190,.035,.028,`triangle`,this.feedback,.055)}melee(){this.noise({duration:.13,volume:.08,filter:`bandpass`,frequency:460,q:.7},this.feedback),this.sweep(135,62,.11,.075,`sawtooth`,this.feedback)}footstep(e,t=!1,n=!1){this.stepVariant=(this.stepVariant+1)%4;let r=[.94,1.04,.98,1.08][this.stepVariant],i=(t?82:n?54:68)*r,a=e===`asphalt`?{frequency:1050,tone:72,volume:1}:e===`concrete`?{frequency:1420,tone:86,volume:.94}:e===`wood`?{frequency:720,tone:118,volume:.9}:{frequency:430,tone:48,volume:.78};this.noise({duration:t?.075:.055,volume:(n?.022:t?.052:.034)*a.volume,filter:e===`soil`?`lowpass`:`bandpass`,frequency:a.frequency,q:e===`concrete`?1.15:.72},this.movement),this.sweep(i+a.tone*.2,Math.max(32,a.tone*.48),t?.075:.06,n?.018:.034,`triangle`,this.movement),e===`wood`?this.tone(a.tone,.035,n?.012:.022,`square`,this.movement,.018):(e===`asphalt`||e===`concrete`)&&this.noise({duration:.022,volume:n?.008:.014,filter:`highpass`,frequency:2800,q:.6,delay:.012},this.movement)}land(e){let t=Math.min(1,Math.max(.25,e/14));this.noise({duration:.12,volume:.08*t,filter:`lowpass`,frequency:540},this.movement),this.sweep(88,36,.13,.065*t,`sine`,this.movement)}grenadeBounce(e){let t=Math.min(1,Math.max(.2,e/10));this.tone(310,.025,.035*t,`triangle`,this.feedback),this.tone(185,.035,.026*t,`square`,this.feedback,.012)}explosion(){this.unlock(),this.weapons&&(this.sweep(96,24,.58,.29,`sawtooth`,this.weapons),this.noise({duration:.64,volume:.42,filter:`lowpass`,frequency:2100,q:.5},this.weapons),this.noise({duration:.18,volume:.12,filter:`highpass`,frequency:3100,q:.4,delay:.035},this.weapons))}createBus(e){let t=this.context.createGain();return t.gain.value=e,t.connect(this.master),t}createNoiseBuffer(e){let t=Math.floor(this.context.sampleRate*e),n=this.context.createBuffer(1,t,this.context.sampleRate),r=n.getChannelData(0),i=0;for(let e=0;e<t;e+=1){let t=Math.random()*2-1;i=i*.16+t*.84,r[e]=i}return n}noise(e,t){if(this.unlock(),!this.context||!this.noiseBuffer||!t)return;let n=this.context.currentTime+(e.delay??0),r=this.context.createBufferSource();r.buffer=this.noiseBuffer;let i=this.context.createBiquadFilter();i.type=e.filter,i.frequency.value=e.frequency,i.Q.value=e.q??.7;let a=this.context.createGain();a.gain.setValueAtTime(Math.max(1e-4,e.volume),n),a.gain.exponentialRampToValueAtTime(1e-4,n+e.duration),r.connect(i).connect(a).connect(t),r.start(n,Math.random()*Math.max(.001,this.noiseBuffer.duration-e.duration),e.duration)}sweep(e,t,n,r,i,a,o=0){if(this.unlock(),!this.context||!a)return;let s=this.context.currentTime+o,c=this.context.createOscillator(),l=this.context.createGain();c.type=i,c.frequency.setValueAtTime(e,s),c.frequency.exponentialRampToValueAtTime(Math.max(1,t),s+n),l.gain.setValueAtTime(Math.max(1e-4,r),s),l.gain.exponentialRampToValueAtTime(1e-4,s+n),c.connect(l).connect(a),c.start(s),c.stop(s+n)}tone(e,t,n,r=`sine`,i=this.feedback,a=0){this.sweep(e,Math.max(1,e*.91),t,n,r,i,a)}};function Mf(e,t,n,r=.17){let i=null;for(let a of n){let n=[a.minX-r,(a.minY??0)-r,a.minZ-r],o=[a.maxX+r,(a.maxY??8)+r,a.maxZ+r],s=[e.x,e.y,e.z],c=[t.x,t.y,t.z],l=0,u=1,d=-1,f=0,p=!0;for(let e=0;e<3;e+=1){if(Math.abs(c[e])<1e-7){(s[e]<n[e]||s[e]>o[e])&&(p=!1);continue}let t=(n[e]-s[e])/c[e],r=(o[e]-s[e])/c[e],i=-Math.sign(c[e]);if(t>r&&([t,r]=[r,t],i*=-1),t>l&&(l=t,d=e,f=i),u=Math.min(u,r),l>u){p=!1;break}}if(!p||d<0||l<0||l>1||i&&l>=i.time)continue;let m={x:0,y:0,z:0};d===0?m.x=f:d===1?m.y=f:m.z=f,i={time:l,normal:m}}return i}function Nf(e,t,n,r){let i=Math.max(r.minX,Math.min(e,r.maxX)),a=Math.max(r.minZ,Math.min(t,r.maxZ)),o=e-i,s=t-a;return o*o+s*s<n*n}function Pf(e,t,n,r=.02){let i=0,a=1;for(let[o,s,c,l]of[[e.x,t.x-e.x,n.minX-r,n.maxX+r],[e.y,t.y-e.y,(n.minY??0)-r,(n.maxY??8)+r],[e.z,t.z-e.z,n.minZ-r,n.maxZ+r]]){if(Math.abs(s)<1e-8){if(o<c||o>l)return null;continue}let e=(c-o)/s,t=(l-o)/s;if(i=Math.max(i,Math.min(e,t)),a=Math.min(a,Math.max(e,t)),i>a)return null}return a>.01&&i<.99?Math.max(0,i):null}function Ff(e,t,n,r=.02){return Pf(e,t,n,r)!==null}function If(e,t,n,r=.02){let i=null;for(let a of n){let n=Pf(e,t,a,r);n!==null&&(!i||n<i.time)&&(i={box:a,time:n})}return i}function Lf(e,t,n,r,i,a){let o=Math.hypot(t.x,t.y,t.z)||1,s={x:t.x/o,y:t.y/o,z:t.z/o},c=If(e,{x:e.x+s.x*n,y:e.y+s.y*n,z:e.z+s.z*n},a),l=c?n*c.time:n,u={x:r.x-e.x,y:r.y-e.y,z:r.z-e.z},d=u.x*s.x+u.y*s.y+u.z*s.z,f={x:e.x+s.x*d,y:e.y+s.y*d,z:e.z+s.z*d},p=Math.hypot(r.x-f.x,r.y-f.y,r.z-f.z),m=c!==null&&l<d-i;return{hitTarget:d>0&&d<=n&&p<i&&!m,blockedByCover:m,tracerDistance:l,targetDistanceAlongRay:d}}function Rf(e,t,n=.42){return t.some(t=>t.minY!==void 0&&e.y<t.minY||t.maxY!==void 0&&e.y-1.65>t.maxY?!1:Nf(e.x,e.z,n,t))}function zf(e,t,n,r,i=.42){let a={...e},o=Math.max(r.minX+i,Math.min(t.x,r.maxX-i));Rf({x:o,y:t.y,z:e.z},n,i)||(a.x=o);let s=Math.max(r.minZ+i,Math.min(t.z,r.maxZ-i));return Rf({x:a.x,y:t.y,z:s},n,i)||(a.z=s),a.y=t.y,a}function Bf(e,t,n=0){return e.x>=t.minX+n&&e.x<=t.maxX-n&&e.z>=t.minZ+n&&e.z<=t.maxZ-n}function Vf(e,t,n=0){return{x:Math.max(t.minX+n,Math.min(e.x,t.maxX-n)),y:e.y,z:Math.max(t.minZ+n,Math.min(e.z,t.maxZ-n))}}function Hf(e,t){return Math.atan2(Math.sin(t-e),Math.cos(t-e))}function Uf(e,t,n,r){return e+(t-e)*(1-Math.exp(-n*r))}var Wf=.5,Gf={carbine:{id:`carbine`,name:`M86 Carbine`,damage:31,minimumDamage:20,falloffStart:24,falloffEnd:72,headMultiplier:1.45,limbMultiplier:.82,rpm:650,mag:30,reserve:120,reload:1.8,hipSpread:.012,adsSpreadMultiplier:.28,movementSpreadMultiplier:1.65,crouchSpreadMultiplier:.78,sustainedSpreadPerShot:.0016,maximumSpread:.045,pellets:1,recoilPitch:.016,recoilYaw:.006,recoilRecovery:12,switchSeconds:.48,automatic:!0,color:16765286},smg:{id:`smg`,name:`Vectorline SMG`,damage:23,minimumDamage:14,falloffStart:15,falloffEnd:52,headMultiplier:1.35,limbMultiplier:.8,rpm:860,mag:32,reserve:128,reload:1.5,hipSpread:.018,adsSpreadMultiplier:.42,movementSpreadMultiplier:1.45,crouchSpreadMultiplier:.82,sustainedSpreadPerShot:.0021,maximumSpread:.058,pellets:1,recoilPitch:.011,recoilYaw:.009,recoilRecovery:15,switchSeconds:.4,automatic:!0,color:6678527},scattergun:{id:`scattergun`,name:`Model 12 Scattergun`,damage:14,minimumDamage:5,falloffStart:8,falloffEnd:30,headMultiplier:1.15,limbMultiplier:.88,rpm:82,mag:8,reserve:40,reload:2.35,hipSpread:.068,adsSpreadMultiplier:.72,movementSpreadMultiplier:1.22,crouchSpreadMultiplier:.88,sustainedSpreadPerShot:.002,maximumSpread:.09,pellets:9,recoilPitch:.052,recoilYaw:.012,recoilRecovery:8,switchSeconds:.62,automatic:!1,color:16747099}};function Kf(e){let t=e.prone===!0,n=t?1.55:e.crouched?3.15:e.ads?4.05:e.sprinting?8.7:6.15,r=t?17:e.crouched?36:e.sprinting?54:e.ads?40:48;return{maxSpeed:n,acceleration:e.grounded?r:10.5,deceleration:e.grounded?t?25:e.crouched?42:62:2.4,friction:e.grounded?0:.25,eyeHeight:t?.5:e.crouched?1.16:1.7,jumpVelocity:6.35}}function qf(e,t,n){return e<t?Math.min(t,e+n):e>t?Math.max(t,e-n):t}function Jf(e,t,n,r){let i=Math.hypot(t.x,t.z),a=i>1?{x:t.x/i,z:t.z/i}:t,o={x:a.x*n.maxSpeed,z:a.z*n.maxSpeed},s=i>.001?n.acceleration:n.deceleration,c=Math.max(0,s*Math.max(0,r)),l={x:o.x-e.x,z:o.z-e.z},u=Math.hypot(l.x,l.z);if(u<=c||u<1e-8)return o;let d=c/u;return{x:e.x+l.x*d,z:e.z+l.z*d}}function Yf(e,t,n,r,i=!1){return!n&&!r&&!i&&e>.45&&Math.abs(t)<.92}function Xf(e,t){return t===`stand`?`stand`:t===`toggle-prone`?e===`prone`?`stand`:`prone`:e===`stand`?`crouch`:e===`crouch`?`stand`:`crouch`}function Zf(e,t){return e?.68:t?.94:1}function Qf(e,t,n=.14,r=1.6){if(![e,t,n,r].every(Number.isFinite))return{x:0,y:0};let i=Math.max(0,Math.min(.99,n)),a=Math.max(.01,r),o=Math.hypot(e,t);if(o<=i||o<1e-8)return{x:0,y:0};let s=((Math.min(1,o)-i)/Math.max(.001,1-i))**+a;return{x:e/o*s,y:t/o*s}}function $f(e,t,n,r,i=1){let a=Math.max(0,Math.min(.05,n)),o=Math.max(.5,Math.min(1.8,Number.isFinite(i)?i:1)),s=Math.min(1,Math.hypot(t.x,t.y))>.92?1.08:1,c=(r?2.02:3.78)*o*s,l=t.x*c,u=t.y*c*.8,d=r?16.5:22,f=(e,t)=>qf(e,t,((e===0||Math.sign(e)===Math.sign(t))&&Math.abs(t)>Math.abs(e)?d:29)*a);return{yaw:f(e.yaw,l),pitch:f(e.pitch,u)}}function ep(e,t){let n=e.hipSpread;return t.ads&&(n*=e.adsSpreadMultiplier),t.moving&&(n*=e.movementSpreadMultiplier),t.crouched&&(n*=e.crouchSpreadMultiplier),t.prone&&(n*=.62),n+=Math.max(0,t.sustainedShots)*e.sustainedSpreadPerShot,Math.min(e.maximumSpread,n)}function tp(e,t,n){let r=Math.tan(Math.max(0,e))*Math.sqrt(Math.min(1,Math.max(0,t))),i=Math.min(1,Math.max(0,n))*Math.PI*2;return{x:Math.cos(i)*r,y:Math.sin(i)*r}}function np(e,t,n){let r=Math.max(0,t),i=r<=e.falloffStart?0:Math.min(1,(r-e.falloffStart)/Math.max(.001,e.falloffEnd-e.falloffStart)),a=e.damage+(e.minimumDamage-e.damage)*i,o=n===`head`?e.headMultiplier:n===`limb`?e.limbMultiplier:1;return Math.max(1,Math.round(a*o))}function rp(e,t,n,r){if(t>=e.mag||n<=0)return null;let i=e.reload*1e3;return{weapon:e.id,startedAt:r,seatAt:r+i*.72,endsAt:r+i,phase:`eject`}}function ip(e,t){return t<e.seatAt}function ap(e,t,n,r){if(t<e.endsAt)return{ammo:n,reserve:r,completed:!1};let i=Gf[e.weapon],a=Math.min(i.mag-n,r);return{ammo:n+a,reserve:r-a,completed:!0}}function op(e,t,n){return Math.max(0,e*Math.exp(-t.recoilRecovery*Math.max(0,n)))}function sp(e,t,n){let r=1+Math.min(.48,Math.max(0,t)*.045),i=Math.max(-1,Math.min(1,n*2-1));return{pitch:e.recoilPitch*r,yaw:e.recoilYaw*i*(.8+r*.28)}}function cp(e,t,n){let r=Math.exp(-t.recoilRecovery*Math.max(0,n));return{pitch:e.pitch*r,yaw:e.yaw*r}}function lp(e){if(e>=8)return 0;let t=Math.max(0,1-Math.max(0,e)/8);return Math.round(115*t*t)}function up(e,t,n){let r=t-n>=650&&e<=1.75;return{hit:r,damage:r?100:0}}function dp(e){return{phase:`warmup`,phaseStartedAt:e,endsAt:e+3e3,winner:null}}function fp(e,t,n){return e.phase===`ended`&&e.rematchRequested?dp(t):e.phase===`warmup`&&t>=e.endsAt?{phase:`active`,phaseStartedAt:t,endsAt:t+3e5,winner:null}:e.phase===`active`&&(n[0]>=25||n[1]>=25||t>=e.endsAt)?{phase:`ended`,phaseStartedAt:t,endsAt:t,winner:n[0]===n[1]?`draw`:n[0]>n[1]?0:1,endReason:n[0]>=25||n[1]>=25?`score`:`time`}:e}var pp=(e,t=.78,n=.03)=>new W({color:e,roughness:t,metalness:n});function mp(e){let t=[],n=[],r=[],i=new Rn;i.name=`Atomic Acres arena`,e.add(i);let a={grass:Jd(`./assets/original/textures/grass-turf.png`,{roughness:1,repeatX:12,repeatY:16}),grassDark:Jd(`./assets/original/textures/grass-turf.png`,{color:8294762,roughness:1,repeatX:8,repeatY:8}),road:Jd(`./assets/original/textures/asphalt-aged.png`,{roughness:.98,repeatX:5,repeatY:20}),concrete:Jd(`./assets/original/textures/concrete-poured.png`,{roughness:.94,repeatX:3,repeatY:3}),cream:Jd(`./assets/original/textures/brick-warm.png`,{color:15785405,roughness:.86,repeatX:4,repeatY:2}),aqua:Jd(`./assets/original/textures/siding-aqua.png`,{roughness:.76,repeatX:4,repeatY:4}),coral:Jd(`./assets/original/textures/siding-coral.png`,{roughness:.76,repeatX:4,repeatY:4}),mustard:pp(14263355,.58,.18),dark:Jd(`./assets/original/textures/weapon-gunmetal.png`,{roughness:.56,metalness:.3,repeatX:3,repeatY:2}),timber:Jd(`./assets/original/textures/wood-deck.png`,{roughness:.92,repeatX:4,repeatY:2}),glass:new rs({color:7912144,roughness:.1,metalness:.04,transparent:!0,opacity:.54,transmission:.12}),white:pp(15787209,.68),chrome:pp(11451841,.23,.76),brick:Jd(`./assets/original/textures/brick-warm.png`,{roughness:.9,repeatX:5,repeatY:3}),roof:Jd(`./assets/original/textures/roof-shingles.png`,{roughness:.86,repeatX:5,repeatY:6})};function o(e,r,a,o,s=!0,c=!0,l=s){let u=new U(new ba(...a),o);return u.name=e,u.userData.impactSurface=xf({name:e,metalness:o instanceof W?o.metalness:void 0}),u.position.set(...r),u.castShadow=c,u.receiveShadow=!0,i.add(u),l&&n.push(u),s&&t.push({minX:r[0]-a[0]/2,maxX:r[0]+a[0]/2,minZ:r[2]-a[2]/2,maxZ:r[2]+a[2]/2,minY:r[1]-a[1]/2,maxY:r[1]+a[1]/2}),u}function s(e,t,n){let r=o(e,t,n,a.dark,!0,!0);r.visible=!1,r.userData.collisionProxy=!0}let c=new U(new Ho(86,98),a.grass);c.rotation.x=-Math.PI/2,c.receiveShadow=!0,c.userData.impactSurface=`soil`,i.add(c),n.push(c);let l=new U(new Ho(19,88),a.road);l.name=`aged asphalt road`,l.rotation.x=-Math.PI/2,l.position.y=.025,l.receiveShadow=!0,l.userData.impactSurface=`concrete`,i.add(l),n.push(l);for(let e of[-10.25,10.25])o(`curb`,[e,.12,0],[1.4,.24,88],a.concrete,!1,!1);for(let e of[-12.6,12.6])o(`sidewalk`,[e,.07,0],[3.2,.14,88],a.concrete,!1,!1);for(let e=-38;e<=38;e+=8)o(`lane marker`,[0,.055,e],[.18,.03,3.6],a.mustard,!1,!1);for(let e of[-18,18])for(let t=-7.5;t<=7.5;t+=2.5)o(`crosswalk stripe`,[t,.062,e],[1.4,.025,3.2],a.white,!1,!1);function u(e,t,n,r){let i=e===0?a.aqua:a.coral,s=n+r*7.2,c=n-r*7.2,l=a.white;o(`house-ground-side`,[t-8.1,1.65,n],[.45,3.3,14.8],i),o(`house-ground-side`,[t+8.1,1.65,n],[.45,3.3,14.8],i);for(let e of[s,c])o(`house-ground-wall`,[t-5.2,1.65,e],[5.8,3.3,.45],i),o(`house-ground-wall`,[t+5.2,1.65,e],[5.8,3.3,.45],i),o(`door-lintel`,[t,3.02,e],[4.55,.56,.45],l),o(`door-trim-left`,[t-2.28,1.35,e+r*.08],[.15,2.7,.12],l,!1),o(`door-trim-right`,[t+2.28,1.35,e+r*.08],[.15,2.7,.12],l,!1);o(`interior-divider-left`,[t-4.9,1.55,n],[5.6,3.1,.25],a.brick),o(`interior-divider-right`,[t+5.9,1.55,n],[4.2,3.1,.25],a.brick),o(`upper-floor-left`,[t-4.9,3.48,n],[6.2,.3,13.7],a.timber),o(`upper-floor-right-front`,[t+4.9,3.48,n+r*4.25],[6.2,.3,5.2],a.timber),o(`upper-floor-right-rear`,[t+4.9,3.48,n-r*4.25],[6.2,.3,5.2],a.timber);for(let e=0;e<10;e+=1){let i=.34*(e+1);o(`interior-stair`,[t+4.85,i/2,n-r*3.45+r*e*.62],[2.5,i,.66],a.timber)}o(`house-upper-side`,[t-8.1,5.45,n],[.45,3.65,14.8],i),o(`house-upper-side`,[t+8.1,5.45,n],[.45,3.65,14.8],i);for(let e of[s,c]){o(`upper-wall-left`,[t-6.3,5.45,e],[3.6,3.65,.45],i),o(`upper-wall-centre`,[t,5.45,e],[3.4,3.65,.45],i),o(`upper-wall-right`,[t+6.3,5.45,e],[3.6,3.65,.45],i);for(let n of[t-3.75,t+3.75])o(`window-glass`,[n,5.55,e+r*.08],[2.2,1.55,.1],a.glass,!1,!1),o(`window-top-trim`,[n,6.43,e+r*.14],[2.5,.13,.13],l,!1),o(`window-bottom-trim`,[n,4.67,e+r*.14],[2.5,.13,.13],l,!1)}let u=o(`pitched-roof`,[t-4.15,8.15,n],[9.2,.48,15.7],a.roof,!1);u.rotation.z=-.24;let d=o(`pitched-roof`,[t+4.15,8.15,n],[9.2,.48,15.7],a.roof,!1);d.rotation.z=.24,o(`front-porch`,[t,.22,s+r*1.4],[8.2,.44,2.5],a.concrete,!1),o(`rear-deck`,[t,.36,c-r*2],[10,.72,3.5],a.timber,!0);for(let e of[t-3.5,t+3.5])o(`porch-column`,[e,1.8,s+r*1.65],[.28,3.6,.28],l,!1);o(`balcony`,[t,4.1,c-r*1.1],[10,.4,2.2],a.concrete,!1),o(`chimney`,[t+5.4,8.6,n-r*3],[1.45,3.4,1.45],a.brick,!1),o(`gutter`,[t-8.25,7.68,n],[.18,.18,15.5],a.chrome,!1,!1),o(`gutter`,[t+8.25,7.68,n],[.18,.18,15.5],a.chrome,!1,!1)}for(let e of lf)u(e.team,e.x,e.z,e.facing);o(`tour coach`,[-3.8,1.75,7],[5.4,3.5,14],a.mustard),o(`coach roof`,[-3.8,3.62,7],[5.15,.25,13.2],a.white,!1);for(let e of[2.6,6,9.4,12.8])o(`coach window`,[-6.53,2.35,e],[.12,1.1,2.3],a.glass,!1,!1),o(`coach window`,[-1.07,2.35,e],[.12,1.1,2.3],a.glass,!1,!1);for(let e of[2,12])for(let t of[-5.7,-1.9]){let n=new U(new Ca(.65,.65,.38,16),a.dark);n.rotation.z=Math.PI/2,n.position.set(t,.7,e),i.add(n)}o(`delivery truck`,[4.2,1.55,-8],[4.8,3.1,8.8],a.aqua),o(`truck cab`,[4.2,1.35,-13],[4.8,2.7,3.4],a.cream),o(`truck windshield`,[4.2,2.05,-14.73],[3.5,1.05,.1],a.glass,!1,!1);let[d,f]=uf;o(`north garage`,[d.x,1.7,d.z],[12,3.4,6.5],a.cream),o(`south garage`,[f.x,1.7,f.z],[12,3.4,6.5],a.cream),o(`garage door`,[d.x,1.55,d.z+3.3],[9,2.7,.18],a.chrome,!1,!1),o(`garage door`,[f.x,1.55,f.z-3.3],[9,2.7,.18],a.chrome,!1,!1),o(`atomic landmark plinth`,[27,.38,-1.5],[5.8,.76,5.8],a.concrete),df.forEach(([e,t,n,r],i)=>o(`cover ${i}`,[e,.8,t],[n,1.6,r],i%2?a.coral:a.aqua));for(let e of[-29,-22])for(let t of[-15,-5])s(`skyline trellis column`,[e,1.9,t],[.55,3.8,.55]);s(`greenhouse west wall`,[-29,1.5,16],[.45,3,8]),s(`greenhouse east wall`,[-22,1.5,16],[.45,3,8]),s(`greenhouse north wall`,[-25.5,1.5,19.8],[7.5,3,.45]),s(`greenhouse south left`,[-28,1.5,12.2],[2.2,3,.45]),s(`greenhouse south right`,[-23,1.5,12.2],[2.2,3,.45]),s(`service wall west`,[22.5,.75,9],[.7,1.5,10]),s(`service wall east`,[28.5,.75,9],[.7,1.5,10]);for(let e of[22.5,29.5])for(let t of[-20,-12])s(`solar canopy column`,[e,2.1,t],[.6,4.2,.6]);o(`west fence`,[-34.3,1.5,0],[.6,3,88],a.timber),o(`east fence`,[34.3,1.5,0],[.6,3,88],a.timber),o(`north fence`,[0,1.5,-43.3],[69,3,.6],a.timber),o(`south fence`,[0,1.5,43.3],[69,3,.6],a.timber);for(let e=-39;e<=39;e+=6.5)o(`fence post`,[-33.9,2.1,e],[.8,4.2,.8],a.dark,!1),o(`fence post`,[33.9,2.1,e],[.8,4.2,.8],a.dark,!1);function p(e,t,n,r,a=0){let o=document.createElement(`canvas`);o.width=512,o.height=192;let s=o.getContext(`2d`);s.fillStyle=`#13242b`,s.fillRect(0,0,o.width,o.height),s.strokeStyle=`#f3c34d`,s.lineWidth=16,s.strokeRect(8,8,o.width-16,o.height-16),s.fillStyle=`#f6ead6`,s.font=`900 58px Arial`,s.textAlign=`center`,s.textBaseline=`middle`,s.fillText(e,o.width/2,o.height/2);let c=new ga(o);c.colorSpace=Ze;let l=new U(new Ho(7,2.65),new _i({map:c}));l.position.set(t,n,r),l.rotation.y=a,i.add(l)}p(`ATOMIC ACRES`,0,4.7,-42.9,0),p(`TEST BLOCK 86`,0,4.7,42.9,Math.PI);function m(e,t,n,o){let s=new Rn;s.name=`practice-target`,s.userData.targetId=e,s.position.set(t,0,n);let c=o===0?a.aqua:a.coral,l=new U(new xa(.34,1.05,5,10),c);l.position.y=1.05,l.castShadow=!0;let u=new U(new Go(.28,12,8),a.cream);u.position.y=1.92,u.castShadow=!0,s.add(l,u),s.traverse(e=>{e.userData.targetRoot=s}),i.add(s),r.push({id:e,root:s,active:!0,respawnAt:0})}m(`north-yard`,-20,-34,1),m(`north-lane`,18,-12,1),m(`south-yard`,20,34,0),m(`south-lane`,-18,12,0),m(`mid-coach`,8,4,1),m(`mid-truck`,-8,-6,0);for(let[e,t]of[[-13,-16],[13,16],[-13,22],[13,-22]]){o(`lamp pole`,[e,2.8,t],[.15,5.6,.15],a.dark,!1);let n=new U(new Go(.28,10,8),new W({color:16773045,emissive:16758861,emissiveIntensity:2.2}));n.position.set(e,5.55,t),i.add(n)}return{colliders:t,raycastMeshes:n,targets:r,bounds:{...cf},spawns:{0:ff[0].map(([e,t])=>new z(e,1.7,t)),1:ff[1].map(([e,t])=>new z(e,1.7,t))}}}function hp(e,t,n,r,i){let a=Math.max(0,Math.min(1,(e-n.minX)/Math.max(.001,n.maxX-n.minX))),o=Math.max(0,Math.min(1,(t-n.minZ)/Math.max(.001,n.maxZ-n.minZ)));return[a*r,i-o*i]}function gp(e,t,n){return e<=15||n>0&&t-n<=3e3}function _p(e,t){return t<-25?`aqua-home`:t>25?`coral-home`:e<-17?`west-garden`:e>17?`east-service`:`central-transit`}function vp(e){return e===`aqua-home`?`AQUA HOUSE`:e===`coral-home`?`CORAL HOUSE`:e===`west-garden`?`SKYLINE GARDEN`:e===`east-service`?`SOLAR SERVICE`:`ATOM-LINER CROSSING`}function yp(e){let t=Math.max(0,e)/1e3;return{landmarkYaw:t*.12,beaconPulse:.55+.45*Math.sin(t*Math.PI*1.4),signGlow:.72+.28*Math.sin(t*.85)}}function bp(e,t=!1){let n=Math.max(0,t?Math.ceil(e/1e3):Math.floor(e/1e3));return`${String(Math.floor(n/60)).padStart(2,`0`)}:${String(n%60).padStart(2,`0`)}`}function xp(e,t,n,r){if(e.phase===`warmup`){let n=Math.max(0,Math.ceil((e.endsAt-t)/1e3));return{timer:bp(e.endsAt-t,!0),objective:`MATCH STARTS IN ${n}`,headline:n>0?String(n):`ENGAGE`,subline:`FIRST SQUAD TO 25`}}if(e.phase===`ended`){let t=e.winner===`draw`,i=e.winner===r;return{timer:`00:00`,objective:e.endReason===`score`?`SCORE LIMIT REACHED`:`TIME LIMIT REACHED`,headline:t?`DRAW`:i?`VICTORY`:`DEFEAT`,subline:`${n[0]} — ${n[1]}`}}let i=n[0]===n[1]?`TIED`:n[r]>n[+(r===0)]?`YOUR SQUAD LEADS`:`HOSTILE SQUAD LEADS`;return{timer:bp(e.endsAt-t),objective:`ATOMIC ACRES · FIRST TO 25 · ${i}`,headline:null,subline:null}}function Sp(e,t){return`REDEPLOYING IN ${Math.max(0,(e-t)/1e3).toFixed(1)}s`}var Cp=new Set([`tour coach`,`coach roof`,`coach window`,`delivery truck`,`truck cab`,`truck windshield`]);function wp(e,t,n,r){let i=Jd(`./assets/original/textures/wood-deck.png`,{color:7491643,roughness:1,repeatY:3}),a=new U(new Ca(.38*r,.55*r,4.2*r,12),i);a.position.set(t,2.1*r,n),a.castShadow=!0,e.add(a);let o=[3495997,4812615,6259273,7902292].map(e=>new W({color:e,roughness:.96}));for(let[a,o]of[[-.7,2.2],[.55,2],[1.7,1.65]]){let s=new U(new Ca(.1*r,.18*r,o*r,8),i);s.position.set(t+Math.sin(a)*.55*r,3.9*r,n+Math.cos(a)*.55*r),s.rotation.z=Math.PI/2.9,s.rotation.y=a,s.castShadow=!0,e.add(s)}[[0,5.35,0,1.85,1.35,1.7],[-1.3,4.85,.45,1.35,1.05,1.2],[1.25,4.95,-.35,1.45,1.05,1.25],[-.5,6.15,-.55,1.25,1.1,1.15],[.65,6.2,.45,1.35,1.15,1.2],[-1.35,5.75,-.45,1.05,.85,1],[1.45,5.8,.65,1,.82,.95],[.05,6.95,0,1.1,.95,1],[0,4.7,1.05,1.25,.9,1]].forEach(([i,a,s,c,l,u],d)=>{let f=new U(new Vo(r,1),o[d%o.length]);f.position.set(t+i*r,a*r,n+s*r),f.scale.set(c,l,u),f.rotation.set(d*.17,d*.43,d*.11),f.castShadow=d<5,e.add(f)})}function Tp(e){let t=Jd(`./assets/original/textures/painted-metal-teal.png`,{roughness:.58,metalness:.3}),n=Jd(`./assets/original/textures/concrete-poured.png`,{roughness:.95,repeatX:2}),r=new W({color:12143928,roughness:.55,metalness:.35}),i=new W({color:5535559,roughness:.96}),a=new Vo(.54,1),o=new W({color:16770485,emissive:16757851,emissiveIntensity:2.4,roughness:.45});for(let[r,i,a]of[[-13,-17,.2],[15,19,Math.PI],[-28,9,Math.PI/2],[27,-11,-Math.PI/2]]){let o=new Rn;o.position.set(r,0,i),o.rotation.y=a;let s=q(`mailbox-post`,[.16,1.35,.16],n,.035);s.position.y=.67;let c=q(`mailbox`,[.7,.48,.95],t,.12,4);c.position.set(0,1.35,0),o.add(s,c),e.add(o)}for(let[t,n]of[[-9,15],[10,-18],[-29,-2],[29,4]]){let i=new Rn;i.position.set(t,0,n);let a=new U(new Ca(.24,.3,.9,12),r);a.position.y=.45,a.castShadow=!0;let o=new U(new Go(.27,12,8,0,Math.PI*2,0,Math.PI/2),r);o.position.y=.9,i.add(a,o),e.add(i)}for(let[t,r]of[[-18,10],[20,-12],[-22,-24],[22,25]]){let o=q(`concrete-planter`,[2.2,.7,1.05],n,.12);o.position.set(t,.35,r),e.add(o);for(let n of[-.6,0,.6]){let o=new U(a,i);o.position.set(t+n,.92+(n===0?.08:0),r),o.scale.set(1,n===0?1.15:.86,.82),o.rotation.y=n*1.7,o.castShadow=!0,e.add(o)}}for(let[n,r]of[[-13,-16],[13,16],[-13,22],[13,-22]]){let i=n<0?1:-1,a=q(`streetlamp-arm`,[1.15,.14,.14],t,.035,2);a.position.set(n+i*.5,5.45,r),Y(a),e.add(a);let s=new U(new Ca(.34,.19,.2,10),t);s.position.set(n+i,5.3,r),Y(s),e.add(s);let c=new U(new Ca(.2,.26,.08,10),o);c.position.set(n+i,5.18,r),Y(c),e.add(c)}}function Y(e){return e.traverse(e=>{e.userData.blocksShots=!1,e instanceof U&&(e.castShadow=!1,e.receiveShadow=!0)}),e}function Ep(e){let t=document.createElement(`canvas`);t.width=768,t.height=180;let n=t.getContext(`2d`);n.fillStyle=`#21343a`,n.fillRect(0,0,t.width,t.height),n.strokeStyle=`#e4bc4d`,n.lineWidth=12,n.strokeRect(10,10,t.width-20,t.height-20),n.fillStyle=`#f3ead5`,n.textAlign=`center`,n.textBaseline=`middle`,n.font=`700 62px system-ui, sans-serif`,n.fillText(e,t.width/2,t.height/2+2);let r=new ga(t);return r.colorSpace=Ze,r}function Dp(e){let t=new W({color:15853004,roughness:.68}),n=Jd(`./assets/original/textures/weapon-gunmetal.png`,{roughness:.62,metalness:.22}),r=Jd(`./assets/original/textures/wood-deck.png`,{roughness:.9,repeatX:3}),i=new W({color:3439232,roughness:.96}),a=new W({color:10309443,roughness:.96}),o=new _i({color:5218209}),s=new _i({color:12150613}),c=new W({color:13352863,emissive:3878944,emissiveIntensity:.32,roughness:.92});for(let l of lf){let u={...l,fabric:l.team===0?i:a,shell:l.team===0?o:s},d=u.z+u.facing*7.48,f=u.z-u.facing*7.55;for(let[t,n]of[[-5.2,5.8],[5.2,5.8],[-6.3,3.6],[0,3.4],[6.3,3.6]]){let r=Math.abs(t)<7&&n<=3.6,i=q(`house-colour-finish`,[n,r?3.5:3.15,.12],u.shell,.025,2);i.position.set(u.x+t,r?5.45:1.65,d+u.facing*.26),Y(i),e.add(i)}for(let t of[-1,1]){let n=q(`house-roof-finish`,[9.2,.26,15.7],u.shell,.045,2);n.position.set(u.x+t*4.15,8.2,u.z),n.rotation.z=t*.24,Y(n),e.add(n)}let p=q(`house-upper-facade-finish`,[15.75,3.5,.13],u.shell,.025,2);p.position.set(u.x,5.45,d+u.facing*.35),Y(p),e.add(p);let m=new no;m.moveTo(-8,0),m.lineTo(8,0),m.lineTo(0,3.25),m.closePath();let h=new U(new Uo(m),u.shell);h.name=`house-gable-finish`,h.position.set(u.x,7.18,d+u.facing*.37),u.facing===1&&(h.rotation.y=Math.PI),Y(h),e.add(h);let g=new _i({color:2377295});for(let t of[-3.75,3.75]){let n=q(`upper-window-finish`,[2.2,1.55,.05],g,.03,2);n.position.set(u.x+t,5.55,d+u.facing*.44),Y(n),e.add(n)}for(let t of[-1,1]){let r=q(`recessed-entry-door`,[.82,2.5,.12],n,.04);r.position.set(u.x+t*1.62,1.28,d+u.facing*.34),r.rotation.y=t*u.facing*.72,Y(r),e.add(r)}let _=q(`entry-awning`,[4.8,.18,1.35],t,.08);_.position.set(u.x,3.35,d+u.facing*.62),_.rotation.x=u.facing*-.11,Y(_),e.add(_);let v=q(`interior-back-wall-finish`,[14.2,6.5,.12],c,.025,2);v.position.set(u.x,3.25,f+u.facing*.22),Y(v),e.add(v);for(let t of[2.9,6.95])for(let r of[u.x-8.38,u.x+8.38]){let i=new U(new Ca(.08,.08,t-.2,8),n);i.position.set(r,t/2,u.z+5.8),Y(i),e.add(i)}for(let n of[-4.2,-1.4,1.4,4.2]){let r=q(`balcony-rail`,[.12,1.05,.12],t,.025);r.position.set(u.x+n,4.72,f-u.facing*1.2),Y(r),e.add(r)}let y=q(`balcony-rail-top`,[9.2,.12,.14],t,.025);y.position.set(u.x,5.2,f-u.facing*1.2),Y(y),e.add(y);let b=new Rn;b.position.set(u.x-3.8,0,u.z+u.facing*1.8);let x=q(`interior-sofa-seat`,[3.2,.58,1.15],u.fabric,.16,4);x.position.y=.55;let S=q(`interior-sofa-back`,[3.2,1.05,.38],u.fabric,.14,4);S.position.set(0,1.12,-u.facing*.42),b.add(x,S),Y(b),e.add(b);let C=q(`interior-counter`,[3.7,1.05,.8],r,.06);C.position.set(u.x+3.2,.53,u.z-u.facing*2.8),Y(C),e.add(C);for(let n of[-5.6,-2.8,2.8,5.6]){let r=q(`garden-wall`,[2.2,.64,.48],t,.1);r.position.set(u.x+n,.32,d+u.facing*3.6),Y(r),e.add(r)}}let l=uf.map((e,t)=>({...e,accent:t===0?i:a}));for(let n of l){let r=q(`garage-facade-finish`,[16,7,.14],new _i({color:n.z<0?5218209:12150613}),.04,2),i=n.z+(n.z<0?3.3:-3.3);r.position.set(n.x,3.5,i),Y(r),e.add(r);let a=new no;a.moveTo(-8,0),a.lineTo(8,0),a.lineTo(0,6.5),a.closePath();let o=new U(new Uo(a),new _i({color:n.z<0?5218209:12150613,side:2}));o.name=`garage-gable-face`,o.position.set(n.x,7,i+(n.z<0?.09:-.09)),Y(o),e.add(o);let s=new U(new Ho(6.2,1.35),new _i({map:Ep(`ATOMIC SERVICE`),side:2}));s.name=`garage-service-sign`,s.position.set(n.x,7.15,i+(n.z<0?.2:-.2)),Y(s),e.add(s);for(let r of[-7.25,7.25]){let a=q(`garage-corner-trim`,[.24,6.6,.1],t,.025,2);a.position.set(n.x+r,3.5,i+(n.z<0?.18:-.18)),Y(a),e.add(a)}let c=q(`garage-door-finish`,[10.2,3.35,.06],t,.04,2);c.position.set(n.x,2.05,i+(n.z<0?.12:-.12)),Y(c),e.add(c);let l=new _i({color:7438982});for(let t of[.9,1.65,2.4,3.15]){let r=q(`garage-door-slat`,[9.8,.08,.04],l,.015,1);r.position.set(n.x,t,i+(n.z<0?.16:-.16)),Y(r),e.add(r)}for(let t of[-1,1]){let r=q(`garage-pitched-roof`,[6.35,.34,7.1],n.accent,.06,2);r.position.set(n.x+t*2.82,4.08,n.z),r.rotation.z=t*.28,Y(r),e.add(r)}}}function Op(e){let t=new W({color:3754061,roughness:.56,metalness:.56}),n=new W({color:14143677,roughness:.42}),r=new Yi({color:2107692,transparent:!0,opacity:.72});for(let[r,i]of[[-29,-35],[-29,0],[-29,35],[29,-35],[29,0],[29,35]]){let a=new U(new Ca(.18,.25,9.6,10),t);a.position.set(r,4.8,i),Y(a),e.add(a);let o=q(`utility-crossbar`,[2.65,.16,.18],t,.035);o.position.set(r,8.75,i),Y(o),e.add(o);for(let t of[-1,0,1]){let a=new U(new Ca(.09,.12,.32,8),n);a.position.set(r+t,9.02,i),Y(a),e.add(a)}}let i=[];for(let e of[-29,29])for(let t of[-1,0,1])for(let[n,r]of[[-35,0],[0,35]]){let a=new z(e+t,9.02,n);for(let o=1;o<=12;o+=1){let s=o/12,c=Math.sin(Math.PI*s)*.65,l=new z(e+t,9.02-c,Bt.lerp(n,r,s));i.push(a,l),a=l}}let a=new sa(new Vr().setFromPoints(i),r);Y(a),e.add(a);let o=new W({color:15185218,roughness:.48,metalness:.28});for(let[n,r,i]of[[-11.3,-6,0],[11.3,6,Math.PI]]){let a=new Rn;a.position.set(n,0,r),a.rotation.y=i;let s=q(`lane-sign-post`,[.15,4.2,.15],t,.025);s.position.y=2.1;let c=q(`lane-sign`,[3.2,.92,.12],o,.08);c.position.set(0,3.65,0),a.add(s,c),Y(a),e.add(a)}}function kp(e){let t=new Rn;t.name=`original-atomic-landmark`,t.position.set(27,0,-1.5);let n=new W({color:5556423,emissive:1194818,emissiveIntensity:1.2,roughness:.36,metalness:.64}),r=[];for(let[e,i]of[0,Math.PI/3,-Math.PI/3].entries()){let a=new U(new Ko(2.25,.13,10,42),n);a.name=`animated-atomic-ring-${e}`,a.userData.dynamic=!0,a.position.y=3.25,a.rotation.set(Math.PI/2,i,i*.45),t.add(a),r.push(a)}let i=new U(new Vo(.62,2),new W({color:16762961,emissive:12081939,emissiveIntensity:1.6,roughness:.32}));i.name=`animated-atomic-nucleus`,i.userData.dynamic=!0,i.position.y=3.25,t.add(i),e.userData.animationRings=r,e.userData.animationNucleus=i,Y(t),e.add(t)}function Ap(e){let t=new W({color:2503738,roughness:.42,metalness:.68}),n=new W({color:15056203,roughness:.52,metalness:.32}),r=Jd(`./assets/original/textures/concrete-poured.png`,{roughness:.9,repeatX:2,repeatY:4}),i=new rs({color:8373955,transparent:!0,opacity:.32,roughness:.18,metalness:.08,depthWrite:!1}),a=new W({color:1523032,emissive:466220,emissiveIntensity:.7,roughness:.3,metalness:.72}),o=new W({color:4812615,roughness:.96}),s=new Vo(.46,1),c=(e,t,n,r)=>q(e,t,n,r,2),l=(e,t,n)=>{let r=new U(new ba(...t),n);return r.name=e,r};for(let n of[-29,-22])for(let r of[-15,-5]){let i=c(`trellis-column`,[.55,3.8,.55],t,.08);i.position.set(n,1.9,r),Y(i),e.add(i)}for(let n of[-15,-11.7,-8.3,-5]){let r=c(`trellis-rib`,[8.1,.22,.36],t,.05);r.position.set(-25.5,4,n),Y(r),e.add(r)}for(let t of[-28.5,-27,-25.5,-24,-22.5]){let r=c(`trellis-slat`,[.18,.16,10.8],n,.04);r.position.set(t,4.08,-10),Y(r),e.add(r)}for(let[t,n,r,i]of[[-28.7,4.08,-14.2,1.05],[-27.1,4.16,-12.1,.82],[-25.5,4.1,-9.5,1.1],[-23.7,4.05,-6.4,.9],[-22.35,3.92,-13.7,.78],[-27.8,3.98,-6.1,.84]]){let a=new U(s,o);a.name=`trellis-vine-cluster`,a.position.set(t,n,r),a.scale.set(i*1.3,i*.52,i*1.45),a.rotation.set(t*.07,r*.11,n*.09),Y(a),e.add(a)}for(let[n,r,i,a]of[[-29,16,.45,8],[-22,16,.45,8],[-25.5,19.8,7.5,.45],[-28,12.2,2.2,.45],[-23,12.2,2.2,.45]]){let o=c(`greenhouse-frame-wall`,[i,3,a],t,.08);o.position.set(n,1.5,r),Y(o),e.add(o)}for(let t of[-27.7,-25.5,-23.3]){let r=c(`greenhouse-roof-rib`,[.18,.18,8.4],n,.04);r.position.set(t,3.45,16),r.rotation.z=t<-25.5?-.22:t>-25.5?.22:0,Y(r),e.add(r)}for(let t of[-27.2,-23.8]){let n=c(`greenhouse-glass`,[2.8,.08,8],i,.02);n.position.set(t,3.5,16),n.rotation.z=t<-25.5?-.22:.22,Y(n),e.add(n)}for(let[t,n]of[[-28,14],[-25.5,18],[-23,14]]){let i=c(`greenhouse-planter`,[1.5,.55,.8],r,.12);i.position.set(t,.28,n),Y(i),e.add(i)}for(let t of[22.5,28.5]){let i=c(`service-channel-wall`,[.7,1.5,10],r,.12);i.position.set(t,.75,9),Y(i),e.add(i);for(let r of[6,9,12]){let i=c(`service-marker`,[.78,.16,1.35],n,.03);i.position.set(t,1.18,r),Y(i),e.add(i)}}for(let n of[22.5,29.5])for(let r of[-20,-12]){let i=c(`solar-column`,[.6,4.2,.6],t,.08);i.position.set(n,2.1,r),Y(i),e.add(i)}let u=c(`solar-canopy`,[8.2,.34,9.2],a,.12);u.position.set(26,4.45,-16),u.rotation.z=-.08,Y(u),e.add(u);for(let t of[23.3,25.1,26.9,28.7]){let r=c(`solar-seam`,[.06,.04,8.5],n,.01);r.position.set(t,4.66+(26-t)*.08,-16),r.rotation.z=-.08,Y(r),e.add(r)}df.forEach(([r,i,a,o],s)=>{let u=c(`barrier-cap`,[a+.18,.16,o+.18],s%2?n:t,.05);u.position.set(r,1.58,i),Y(u),e.add(u);for(let n of[-1,1]){let s=c(`barrier-rib`,[.12,1.18,o+.1],t,.03);s.position.set(r+n*(a/2-.18),.78,i),Y(s),e.add(s);let u=l(`barrier-foot`,[.48,.14,o+.34],t);u.position.set(r+n*(a/2-.34),.08,i),Y(u),e.add(u)}for(let s of[-1,1]){let c=i+s*(o/2+.035),u=l(`barrier-recessed-panel`,[Math.max(.7,a-.48),.92,.07],t);u.position.set(r,.78,c),Y(u),e.add(u);for(let t of[-1,1]){let i=l(`barrier-warning-stripe`,[Math.max(.42,a*.29),.13,.075],n);i.position.set(r+t*a*.21,.8,c+s*.006),i.rotation.z=t*.48,Y(i),e.add(i)}}})}function jp(e,t){let n=new W({color:2438202,roughness:.62,metalness:.28}),r=new W({color:15054914,emissive:7029264,emissiveIntensity:.5,roughness:.52,metalness:.2}),i=new W({color:14206885,roughness:.88}),a=new W({color:7917514,emissive:1797232,emissiveIntensity:1.4,roughness:.28}),o=[[`SKYLINE GARDEN`,-19.2,2.7,-8,Math.PI/2],[`ATOM-LINER CROSSING`,7.4,2.7,0,-Math.PI/2],[`SOLAR SERVICE`,19.2,2.7,8,-Math.PI/2]];for(let[i,a,s,c,l]of o){let o=new Rn;o.name=`route-marker-${i.toLowerCase().replaceAll(` `,`-`)}`,o.position.set(a,0,c),o.rotation.y=l;let u=q(`route-story-post`,[.16,s*2,.16],n,.03,2);if(u.position.y=s,o.add(u),t){let e=q(`route-story-plate`,[2.7,.68,.12],r,.06,2);e.position.y=s*1.72,o.add(e)}else{let e=new U(new Ho(4.3,1.05),new _i({map:Ep(i),side:2}));e.name=`route-story-sign`,e.position.y=s*1.72,o.add(e)}Y(o),e.add(o)}if(!t)for(let t of lf){let o=t.facing,s=q(`interior-dining-table`,[2.5,.16,1.15],i,.06,2);s.position.set(t.x-2.7,.92,t.z-o*2.4),Y(s),e.add(s);for(let n of[-1,1]){let i=q(`interior-dining-chair`,[.58,1.05,.58],t.team===0?a:r,.08,2);i.position.set(t.x-2.7+n*1.65,.53,t.z-o*2.4),Y(i),e.add(i)}let c=q(`interior-atom-console`,[2.2,1.15,.65],n,.08,2);c.position.set(t.x+3.4,.58,t.z+o*2.45),Y(c),e.add(c);let l=q(`interior-console-screen`,[1.5,.52,.05],a,.04,2);l.position.set(t.x+3.4,.83,t.z+o*2.8),Y(l),e.add(l);let u=new U(new Ho(3.7,.85),new _i({map:Ep(t.team===0?`AQUA MODEL HOME`:`CORAL MODEL HOME`),side:2}));u.name=`model-home-plaque`,u.position.set(t.x,3.2,t.z+o*7.72),o<0&&(u.rotation.y=Math.PI),Y(u),e.add(u)}}function Mp(e,t){let n=yp(t);(e.userData.animationRings??[]).forEach((e,t)=>{e.rotation.y=n.landmarkYaw*(t%2==0?1:-1)+t*Math.PI/3});let r=e.userData.animationNucleus;r&&r.scale.setScalar(.96+n.beaconPulse*.08);let i=e.userData.animationBeacon;if(i){i.scale.setScalar(.86+n.beaconPulse*.22);let e=i.material;e instanceof W&&(e.emissiveIntensity=1.7+n.beaconPulse*2)}}function Np(e){let t=new W({color:16770485,emissive:16757851,emissiveIntensity:2.4,roughness:.45});for(let{x:n,z:r}of lf){let i=new Hs(16766880,4.8,21,1.7);i.position.set(n,4.8,r),e.add(i);let a=new U(new Ca(.42,.42,.08,16),t);a.name=`interior-ceiling-light`,a.position.set(n,6.9,r),e.add(a)}}async function Pp(e,t,n=!1){e.traverse(e=>{(Cp.has(e.name)||e.name===`primitive-tree`)&&(e.visible=!1)});let r=new Rn;r.name=`original-arena-art`,e.add(r),Np(r);let i=n||new URLSearchParams(window.location.search).get(`render`)===`compat`;jp(r,i);let a=$d();a.position.set(-3.8,0,7),a.rotation.y=.03,a.traverse(e=>{e.userData.blocksShots=!0}),r.add(a),t?.(1,12);let o=ef();o.position.set(4.2,0,-8.8),o.rotation.y=Math.PI,o.traverse(e=>{e.userData.blocksShots=!0}),r.add(o),t?.(2,12),wp(r,-29,-23,1.05),t?.(3,12),wp(r,29,24,1.1),t?.(4,12),wp(r,-28,29,.82),t?.(5,12),wp(r,27,-31,.9),t?.(6,12),Tp(r),t?.(7,12);let s=new Rn;s.position.set(29,0,-36);let c=new W({color:5003616,roughness:.48,metalness:.55});for(let e of[-1.4,1.4])for(let t of[-1.4,1.4]){let n=q(`test-tower-leg`,[.22,9,.22],c,.04);n.position.set(e,4.5,t),s.add(n)}for(let e=1;e<9;e+=1.6)for(let t of[0,Math.PI/2]){let n=q(`test-tower-brace`,[3.2,.12,.12],c,.025);n.position.y=e,n.rotation.y=t,s.add(n)}let l=new U(new Go(.35,16,12),new W({color:16739151,emissive:16722454,emissiveIntensity:3}));return l.name=`animated-test-beacon`,l.userData.dynamic=!0,r.userData.animationBeacon=l,l.position.y=9.2,s.add(l),Y(s),r.add(s),t?.(8,12),i?(t?.(9,12),t?.(10,12),t?.(11,12)):(Dp(r),t?.(9,12),Op(r),t?.(10,12),Ap(r),kp(r),t?.(11,12)),r.traverse(e=>{e.userData.blocksShots===void 0&&(e.userData.blocksShots=!1)}),t?.(12,12),{root:r,loadedModels:12}}var Fp=72,Ip=32,Lp=-1e4,Rp={metal:[16765034,16743226],concrete:[14209212,9212301],wood:[13869415,7162418],soil:[9217390,6047537]},zp=class{points;marks;positions=new Float32Array(Fp*3);colors=new Float32Array(Fp*3);particles=[];markLife=new Float32Array(Ip);cursor=0;markCursor=0;constructor(e,t=!1){let n=new Vr;this.positions.fill(0);for(let e=0;e<Fp;e+=1)this.positions[e*3+1]=Lp;n.setAttribute(`position`,new Er(this.positions,3)),n.setAttribute(`color`,new Er(this.colors,3));let r=new ca({size:t?.075:.105,vertexColors:!0,transparent:!0,opacity:.94,depthWrite:!1,sizeAttenuation:!0,blending:2});this.points=new pa(n,r),this.points.name=`pooled-surface-impact-debris`,this.points.frustumCulled=!1,this.points.visible=!1,e.add(this.points),this.marks=new Bi(new Ho(1,1),new _i({color:16777215,transparent:!0,opacity:t?.24:.4,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-3}),Ip),this.marks.name=`pooled-surface-impact-marks`,this.marks.frustumCulled=!1,this.marks.visible=!1;let i=new un().makeScale(0,0,0);for(let e=0;e<Ip;e+=1)this.marks.setMatrixAt(e,i);this.marks.instanceMatrix.needsUpdate=!0,e.add(this.marks);for(let e=0;e<Fp;e+=1)this.particles.push({velocity:new z,life:0,maxLife:0,color:new H})}impact(e,t,n){let[r,i]=Rp[n],a=n===`metal`?8:n===`concrete`?6:5,o=new z(t.z,.35,-t.x).normalize(),s=new z().crossVectors(t,o).normalize();for(let c=0;c<a;c+=1){let a=this.cursor++%Fp,l=this.particles[a],u=a*3,d=(Math.random()-.5)*(n===`metal`?4.2:2.6),f=(Math.random()-.5)*2.2,p=n===`metal`?2.4+Math.random()*2.8:.8+Math.random()*1.9;l.velocity.copy(t).multiplyScalar(p).addScaledVector(o,d).addScaledVector(s,f).add(new z(0,n===`soil`?1.2:.55,0)),l.maxLife=n===`metal`?.24:.38,l.life=l.maxLife*(.72+Math.random()*.28),l.color.set(c%2==0?r:i),this.positions[u]=e.x+t.x*.035,this.positions[u+1]=e.y+t.y*.035,this.positions[u+2]=e.z+t.z*.035,this.colors[u]=l.color.r,this.colors[u+1]=l.color.g,this.colors[u+2]=l.color.b}let c=this.markCursor++%Ip,l=t.clone().normalize(),u=e.clone().addScaledVector(l,.018),d=new Vt().setFromUnitVectors(new z(0,0,1),l);d.premultiply(new Vt().setFromAxisAngle(l,Math.random()*Math.PI));let f=n===`metal`?.085:n===`soil`?.15:.12;this.marks.setMatrixAt(c,new un().compose(u,d,new z(f,f,1))),this.marks.setColorAt(c,new H(n===`metal`?6047791:n===`wood`?5059362:n===`soil`?4867375:4868937)),this.markLife[c]=n===`metal`?5.5:8,this.marks.visible=!0,this.marks.instanceMatrix.needsUpdate=!0,this.marks.instanceColor&&(this.marks.instanceColor.needsUpdate=!0),this.points.visible=!0,this.markDirty()}update(e){let t=!1,n=0;for(let r=0;r<this.particles.length;r+=1){let i=this.particles[r];if(i.life<=0)continue;t=!0,i.life-=e;let a=r*3;if(i.life<=0){this.positions[a+1]=Lp,this.colors[a]=this.colors[a+1]=this.colors[a+2]=0;continue}n+=1,i.velocity.y-=5.8*e,this.positions[a]+=i.velocity.x*e,this.positions[a+1]+=i.velocity.y*e,this.positions[a+2]+=i.velocity.z*e;let o=Math.min(1,i.life/Math.max(.001,i.maxLife)*1.8);this.colors[a]=i.color.r*o,this.colors[a+1]=i.color.g*o,this.colors[a+2]=i.color.b*o}this.points.visible=n>0;let r=!1;for(let t=0;t<Ip;t+=1)this.markLife[t]<=0||(this.markLife[t]-=e,this.markLife[t]<=0&&(this.marks.setMatrixAt(t,new un().makeScale(0,0,0)),r=!0));r&&(this.marks.instanceMatrix.needsUpdate=!0),this.marks.visible=this.activeMarks()>0,t&&this.markDirty()}activeParticles(){return this.particles.reduce((e,t)=>e+Number(t.life>0),0)}activeMarks(){return this.markLife.reduce((e,t)=>e+Number(t>0),0)}markDirty(){this.points.geometry.getAttribute(`position`).needsUpdate=!0,this.points.geometry.getAttribute(`color`).needsUpdate=!0}};function Bp(e,t){return e===`prone`?.82:e===`crouch`?1.18:t?2.05:1.62}function Vp(e,t,n){let r=Number.isFinite(t)?Math.max(0,t):0,i=Number.isFinite(n)?Math.max(.2,n):1.6,a=e.distance+r,o=Math.min(4,Math.floor(a/i));return{emitted:o,state:{distance:o>0?a%i:a,side:(e.side+o)%2}}}var Hp=class{samples=[];record(e){!Number.isFinite(e)||e<1||e>250||(this.samples.push(e),this.samples.length>180&&this.samples.splice(0,this.samples.length-180))}summary(){if(this.samples.length===0)return{ready:!1,sampleCount:0,cadenceHz:0,medianMs:0,p95Ms:0,maxMs:0,displayLimited:!1};let e=[...this.samples].sort((e,t)=>e-t),t=t=>e[Math.min(e.length-1,Math.floor((e.length-1)*t))],n=t(.5),r=t(.95),i=n>0?1e3/n:0;return{ready:e.length>=90,sampleCount:e.length,cadenceHz:i,medianMs:n,p95Ms:r,maxMs:e[e.length-1],displayLimited:e.length>=90&&i<55}}},Up=class{constructor(){this.encoder=new TextEncoder,this._pieces=[],this._parts=[]}append_buffer(e){this.flush(),this._parts.push(e)}append(e){this._pieces.push(e)}flush(){if(this._pieces.length>0){let e=new Uint8Array(this._pieces);this._parts.push(e),this._pieces=[]}}toArrayBuffer(){let e=[];for(let t of this._parts)e.push(t);return Wp(e).buffer}};function Wp(e){let t=0;for(let n of e)t+=n.byteLength;let n=new Uint8Array(t),r=0;for(let t of e){let e=new Uint8Array(t.buffer,t.byteOffset,t.byteLength);n.set(e,r),r+=t.byteLength}return n}function Gp(e){return new qp(e).unpack()}function Kp(e){let t=new Jp,n=t.pack(e);return n instanceof Promise?n.then(()=>t.getBuffer()):t.getBuffer()}var qp=class{constructor(e){this.index=0,this.dataBuffer=e,this.dataView=new Uint8Array(this.dataBuffer),this.length=this.dataBuffer.byteLength}unpack(){let e=this.unpack_uint8();if(e<128)return e;if((e^224)<32)return(e^224)-32;let t;if((t=e^160)<=15)return this.unpack_raw(t);if((t=e^176)<=15)return this.unpack_string(t);if((t=e^144)<=15)return this.unpack_array(t);if((t=e^128)<=15)return this.unpack_map(t);switch(e){case 192:return null;case 193:return;case 194:return!1;case 195:return!0;case 202:return this.unpack_float();case 203:return this.unpack_double();case 204:return this.unpack_uint8();case 205:return this.unpack_uint16();case 206:return this.unpack_uint32();case 207:return this.unpack_uint64();case 208:return this.unpack_int8();case 209:return this.unpack_int16();case 210:return this.unpack_int32();case 211:return this.unpack_int64();case 212:return;case 213:return;case 214:return;case 215:return;case 216:return t=this.unpack_uint16(),this.unpack_string(t);case 217:return t=this.unpack_uint32(),this.unpack_string(t);case 218:return t=this.unpack_uint16(),this.unpack_raw(t);case 219:return t=this.unpack_uint32(),this.unpack_raw(t);case 220:return t=this.unpack_uint16(),this.unpack_array(t);case 221:return t=this.unpack_uint32(),this.unpack_array(t);case 222:return t=this.unpack_uint16(),this.unpack_map(t);case 223:return t=this.unpack_uint32(),this.unpack_map(t)}}unpack_uint8(){let e=this.dataView[this.index]&255;return this.index++,e}unpack_uint16(){let e=this.read(2),t=(e[0]&255)*256+(e[1]&255);return this.index+=2,t}unpack_uint32(){let e=this.read(4),t=((e[0]*256+e[1])*256+e[2])*256+e[3];return this.index+=4,t}unpack_uint64(){let e=this.read(8),t=((((((e[0]*256+e[1])*256+e[2])*256+e[3])*256+e[4])*256+e[5])*256+e[6])*256+e[7];return this.index+=8,t}unpack_int8(){let e=this.unpack_uint8();return e<128?e:e-256}unpack_int16(){let e=this.unpack_uint16();return e<32768?e:e-65536}unpack_int32(){let e=this.unpack_uint32();return e<2**31?e:e-2**32}unpack_int64(){let e=this.unpack_uint64();return e<2**63?e:e-2**64}unpack_raw(e){if(this.length<this.index+e)throw Error(`BinaryPackFailure: index is out of range ${this.index} ${e} ${this.length}`);let t=this.dataBuffer.slice(this.index,this.index+e);return this.index+=e,t}unpack_string(e){let t=this.read(e),n=0,r=``,i,a;for(;n<e;)i=t[n],i<160?(a=i,n++):(i^192)<32?(a=(i&31)<<6|t[n+1]&63,n+=2):(i^224)<16?(a=(i&15)<<12|(t[n+1]&63)<<6|t[n+2]&63,n+=3):(a=(i&7)<<18|(t[n+1]&63)<<12|(t[n+2]&63)<<6|t[n+3]&63,n+=4),r+=String.fromCodePoint(a);return this.index+=e,r}unpack_array(e){let t=Array(e);for(let n=0;n<e;n++)t[n]=this.unpack();return t}unpack_map(e){let t={};for(let n=0;n<e;n++){let e=this.unpack();t[e]=this.unpack()}return t}unpack_float(){let e=this.unpack_uint32(),t=e>>31,n=(e>>23&255)-127,r=e&8388607|8388608;return(t===0?1:-1)*r*2**(n-23)}unpack_double(){let e=this.unpack_uint32(),t=this.unpack_uint32(),n=e>>31,r=(e>>20&2047)-1023,i=(e&1048575|1048576)*2**(r-20)+t*2**(r-52);return(n===0?1:-1)*i}read(e){let t=this.index;if(t+e<=this.length)return this.dataView.subarray(t,t+e);throw Error(`BinaryPackFailure: read index out of range`)}},Jp=class{getBuffer(){return this._bufferBuilder.toArrayBuffer()}pack(e){if(typeof e==`string`)this.pack_string(e);else if(typeof e==`number`)Math.floor(e)===e?this.pack_integer(e):this.pack_double(e);else if(typeof e==`boolean`)e===!0?this._bufferBuilder.append(195):e===!1&&this._bufferBuilder.append(194);else if(e===void 0)this._bufferBuilder.append(192);else if(typeof e==`object`)if(e===null)this._bufferBuilder.append(192);else{let t=e.constructor;if(e instanceof Array){let t=this.pack_array(e);if(t instanceof Promise)return t.then(()=>this._bufferBuilder.flush())}else if(e instanceof ArrayBuffer)this.pack_bin(new Uint8Array(e));else if(`BYTES_PER_ELEMENT`in e){let t=e;this.pack_bin(new Uint8Array(t.buffer,t.byteOffset,t.byteLength))}else if(e instanceof Date)this.pack_string(e.toString());else if(e instanceof Blob)return e.arrayBuffer().then(e=>{this.pack_bin(new Uint8Array(e)),this._bufferBuilder.flush()});else if(t==Object||t.toString().startsWith(`class`)){let t=this.pack_object(e);if(t instanceof Promise)return t.then(()=>this._bufferBuilder.flush())}else throw Error(`Type "${t.toString()}" not yet supported`)}else throw Error(`Type "${typeof e}" not yet supported`);this._bufferBuilder.flush()}pack_bin(e){let t=e.length;if(t<=15)this.pack_uint8(160+t);else if(t<=65535)this._bufferBuilder.append(218),this.pack_uint16(t);else if(t<=4294967295)this._bufferBuilder.append(219),this.pack_uint32(t);else throw Error(`Invalid length`);this._bufferBuilder.append_buffer(e)}pack_string(e){let t=this._textEncoder.encode(e),n=t.length;if(n<=15)this.pack_uint8(176+n);else if(n<=65535)this._bufferBuilder.append(216),this.pack_uint16(n);else if(n<=4294967295)this._bufferBuilder.append(217),this.pack_uint32(n);else throw Error(`Invalid length`);this._bufferBuilder.append_buffer(t)}pack_array(e){let t=e.length;if(t<=15)this.pack_uint8(144+t);else if(t<=65535)this._bufferBuilder.append(220),this.pack_uint16(t);else if(t<=4294967295)this._bufferBuilder.append(221),this.pack_uint32(t);else throw Error(`Invalid length`);let n=r=>{if(r<t){let t=this.pack(e[r]);return t instanceof Promise?t.then(()=>n(r+1)):n(r+1)}};return n(0)}pack_integer(e){if(e>=-32&&e<=127)this._bufferBuilder.append(e&255);else if(e>=0&&e<=255)this._bufferBuilder.append(204),this.pack_uint8(e);else if(e>=-128&&e<=127)this._bufferBuilder.append(208),this.pack_int8(e);else if(e>=0&&e<=65535)this._bufferBuilder.append(205),this.pack_uint16(e);else if(e>=-32768&&e<=32767)this._bufferBuilder.append(209),this.pack_int16(e);else if(e>=0&&e<=4294967295)this._bufferBuilder.append(206),this.pack_uint32(e);else if(e>=-2147483648&&e<=2147483647)this._bufferBuilder.append(210),this.pack_int32(e);else if(e>=-0x8000000000000000&&e<=0x8000000000000000)this._bufferBuilder.append(211),this.pack_int64(e);else if(e>=0&&e<=0x10000000000000000)this._bufferBuilder.append(207),this.pack_uint64(e);else throw Error(`Invalid integer`)}pack_double(e){let t=0;e<0&&(t=1,e=-e);let n=Math.floor(Math.log(e)/Math.LN2),r=e/2**n-1,i=Math.floor(r*2**52),a=2**32,o=t<<31|n+1023<<20|i/a&1048575,s=i%a;this._bufferBuilder.append(203),this.pack_int32(o),this.pack_int32(s)}pack_object(e){let t=Object.keys(e),n=t.length;if(n<=15)this.pack_uint8(128+n);else if(n<=65535)this._bufferBuilder.append(222),this.pack_uint16(n);else if(n<=4294967295)this._bufferBuilder.append(223),this.pack_uint32(n);else throw Error(`Invalid length`);let r=n=>{if(n<t.length){let i=t[n];if(e.hasOwnProperty(i)){this.pack(i);let t=this.pack(e[i]);if(t instanceof Promise)return t.then(()=>r(n+1))}return r(n+1)}};return r(0)}pack_uint8(e){this._bufferBuilder.append(e)}pack_uint16(e){this._bufferBuilder.append(e>>8),this._bufferBuilder.append(e&255)}pack_uint32(e){let t=e&4294967295;this._bufferBuilder.append((t&4278190080)>>>24),this._bufferBuilder.append((t&16711680)>>>16),this._bufferBuilder.append((t&65280)>>>8),this._bufferBuilder.append(t&255)}pack_uint64(e){let t=e/2**32,n=e%2**32;this._bufferBuilder.append((t&4278190080)>>>24),this._bufferBuilder.append((t&16711680)>>>16),this._bufferBuilder.append((t&65280)>>>8),this._bufferBuilder.append(t&255),this._bufferBuilder.append((n&4278190080)>>>24),this._bufferBuilder.append((n&16711680)>>>16),this._bufferBuilder.append((n&65280)>>>8),this._bufferBuilder.append(n&255)}pack_int8(e){this._bufferBuilder.append(e&255)}pack_int16(e){this._bufferBuilder.append((e&65280)>>8),this._bufferBuilder.append(e&255)}pack_int32(e){this._bufferBuilder.append(e>>>24&255),this._bufferBuilder.append((e&16711680)>>>16),this._bufferBuilder.append((e&65280)>>>8),this._bufferBuilder.append(e&255)}pack_int64(e){let t=Math.floor(e/2**32),n=e%2**32;this._bufferBuilder.append((t&4278190080)>>>24),this._bufferBuilder.append((t&16711680)>>>16),this._bufferBuilder.append((t&65280)>>>8),this._bufferBuilder.append(t&255),this._bufferBuilder.append((n&4278190080)>>>24),this._bufferBuilder.append((n&16711680)>>>16),this._bufferBuilder.append((n&65280)>>>8),this._bufferBuilder.append(n&255)}constructor(){this._bufferBuilder=new Up,this._textEncoder=new TextEncoder}},Yp=!0,Xp=!0;function Zp(e,t,n){let r=e.match(t);return r&&r.length>=n&&parseFloat(r[n],10)}function Qp(e,t,n){if(!e.RTCPeerConnection)return;if(!Object.getOwnPropertyDescriptor(EventTarget.prototype,`addEventListener`).writable){tm(`Unable to polyfill events`);return}let r=e.RTCPeerConnection.prototype,i=r.addEventListener;r.addEventListener=function(e,r){if(e!==t)return i.apply(this,arguments);let a=e=>{let t=n(e);t&&(r.handleEvent?r.handleEvent(t):r(t))};return this._eventMap=this._eventMap||{},this._eventMap[t]||(this._eventMap[t]=new Map),this._eventMap[t].set(r,a),i.apply(this,[e,a])};let a=r.removeEventListener;r.removeEventListener=function(e,n){if(e!==t||!this._eventMap||!this._eventMap[t]||!this._eventMap[t].has(n))return a.apply(this,arguments);let r=this._eventMap[t].get(n);return this._eventMap[t].delete(n),this._eventMap[t].size===0&&delete this._eventMap[t],Object.keys(this._eventMap).length===0&&delete this._eventMap,a.apply(this,[e,r])},Object.defineProperty(r,`on`+t,{get(){return this[`_on`+t]},set(e){this[`_on`+t]&&(this.removeEventListener(t,this[`_on`+t]),delete this[`_on`+t]),e&&this.addEventListener(t,this[`_on`+t]=e)},enumerable:!0,configurable:!0})}function $p(e){return typeof e==`boolean`?(Yp=e,e?`adapter.js logging disabled`:`adapter.js logging enabled`):Error(`Argument type: `+typeof e+`. Please use a boolean.`)}function em(e){return typeof e==`boolean`?(Xp=!e,`adapter.js deprecation warnings `+(e?`disabled`:`enabled`)):Error(`Argument type: `+typeof e+`. Please use a boolean.`)}function tm(){if(typeof window==`object`){if(Yp)return;typeof console<`u`&&typeof console.log==`function`&&console.log.apply(console,arguments)}}function nm(e,t){Xp&&console.warn(e+` is deprecated, please use `+t+` instead.`)}function rm(e){let t={browser:null,version:null};if(e===void 0||!e.navigator||!e.navigator.userAgent)return t.browser=`Not a browser.`,t;let{navigator:n}=e;if(n.userAgentData&&n.userAgentData.brands){let e=n.userAgentData.brands.find(e=>e.brand===`Chromium`);if(e){let t=parseInt(e.version,10);if(t>=90)return{browser:`chrome`,version:t}}}if(n.mozGetUserMedia)t.browser=`firefox`,t.version=parseInt(Zp(n.userAgent,/Firefox\/(\d+)\./,1));else if(n.webkitGetUserMedia||e.isSecureContext===!1&&e.webkitRTCPeerConnection)t.browser=`chrome`,t.version=parseInt(Zp(n.userAgent,/Chrom(e|ium)\/(\d+)\./,2))||null;else if(e.RTCPeerConnection&&n.userAgent.match(/AppleWebKit\/(\d+)\./))t.browser=`safari`,t.version=parseInt(Zp(n.userAgent,/AppleWebKit\/(\d+)\./,1)),t.supportsUnifiedPlan=e.RTCRtpTransceiver&&`currentDirection`in e.RTCRtpTransceiver.prototype,t._safariVersion=Zp(n.userAgent,/Version\/(\d+(\.?\d+))/,1);else return t.browser=`Not a supported browser.`,t;return t}function im(e){return Object.prototype.toString.call(e)===`[object Object]`}function am(e){return im(e)?Object.keys(e).reduce(function(t,n){let r=im(e[n]),i=r?am(e[n]):e[n],a=r&&!Object.keys(i).length;return i===void 0||a?t:Object.assign(t,{[n]:i})},{}):e}function om(e,t,n){!t||n.has(t.id)||(n.set(t.id,t),Object.keys(t).forEach(r=>{r.endsWith(`Id`)?om(e,e.get(t[r]),n):r.endsWith(`Ids`)&&t[r].forEach(t=>{om(e,e.get(t),n)})}))}function sm(e,t,n){let r=n?`outbound-rtp`:`inbound-rtp`,i=new Map;if(t===null)return i;let a=[];return e.forEach(e=>{e.type===`track`&&e.trackIdentifier===t.id&&a.push(e)}),a.forEach(t=>{e.forEach(n=>{n.type===r&&n.trackId===t.id&&om(e,n,i)})}),i}var cm=tm;function lm(e,t){if(t.version>=64)return;let n=e&&e.navigator;if(!n.mediaDevices)return;let r=function(e){if(typeof e!=`object`||e.mandatory||e.optional)return e;let t={};return Object.keys(e).forEach(n=>{if(n===`require`||n===`advanced`||n===`mediaSource`)return;let r=typeof e[n]==`object`?e[n]:{ideal:e[n]};r.exact!==void 0&&typeof r.exact==`number`&&(r.min=r.max=r.exact);let i=function(e,t){return e?e+t.charAt(0).toUpperCase()+t.slice(1):t===`deviceId`?`sourceId`:t};if(r.ideal!==void 0){t.optional=t.optional||[];let e={};typeof r.ideal==`number`?(e[i(`min`,n)]=r.ideal,t.optional.push(e),e={},e[i(`max`,n)]=r.ideal,t.optional.push(e)):(e[i(``,n)]=r.ideal,t.optional.push(e))}r.exact!==void 0&&typeof r.exact!=`number`?(t.mandatory=t.mandatory||{},t.mandatory[i(``,n)]=r.exact):[`min`,`max`].forEach(e=>{r[e]!==void 0&&(t.mandatory=t.mandatory||{},t.mandatory[i(e,n)]=r[e])})}),e.advanced&&(t.optional=(t.optional||[]).concat(e.advanced)),t},i=function(e,i){if(t.version>=61)return i(e);if(e=JSON.parse(JSON.stringify(e)),e&&typeof e.audio==`object`){let t=function(e,t,n){t in e&&!(n in e)&&(e[n]=e[t],delete e[t])};e=JSON.parse(JSON.stringify(e)),t(e.audio,`autoGainControl`,`googAutoGainControl`),t(e.audio,`noiseSuppression`,`googNoiseSuppression`),e.audio=r(e.audio)}if(e&&typeof e.video==`object`){let a=e.video.facingMode;a&&=typeof a==`object`?a:{ideal:a};let o=t.version<66;if(a&&(a.exact===`user`||a.exact===`environment`||a.ideal===`user`||a.ideal===`environment`)&&!(n.mediaDevices.getSupportedConstraints&&n.mediaDevices.getSupportedConstraints().facingMode&&!o)){delete e.video.facingMode;let t;if(a.exact===`environment`||a.ideal===`environment`?t=[`back`,`rear`]:(a.exact===`user`||a.ideal===`user`)&&(t=[`front`]),t)return n.mediaDevices.enumerateDevices().then(n=>{n=n.filter(e=>e.kind===`videoinput`);let o=n.find(e=>t.some(t=>e.label.toLowerCase().includes(t)));return!o&&n.length&&t.includes(`back`)&&(o=n[n.length-1]),o&&(e.video.deviceId=a.exact?{exact:o.deviceId}:{ideal:o.deviceId}),e.video=r(e.video),cm(`chrome: `+JSON.stringify(e)),i(e)})}e.video=r(e.video)}return cm(`chrome: `+JSON.stringify(e)),i(e)},a=function(e){return t.version>=64?e:{name:{PermissionDeniedError:`NotAllowedError`,PermissionDismissedError:`NotAllowedError`,InvalidStateError:`NotAllowedError`,DevicesNotFoundError:`NotFoundError`,ConstraintNotSatisfiedError:`OverconstrainedError`,TrackStartError:`NotReadableError`,MediaDeviceFailedDueToShutdown:`NotAllowedError`,MediaDeviceKillSwitchOn:`NotAllowedError`,TabCaptureError:`AbortError`,ScreenCaptureError:`AbortError`,DeviceCaptureError:`AbortError`}[e.name]||e.name,message:e.message,constraint:e.constraint||e.constraintName,toString(){return this.name+(this.message&&`: `)+this.message}}};if(n.getUserMedia=function(e,t,r){i(e,e=>{n.webkitGetUserMedia(e,t,e=>{r&&r(a(e))})})}.bind(n),n.mediaDevices.getUserMedia){let e=n.mediaDevices.getUserMedia.bind(n.mediaDevices);n.mediaDevices.getUserMedia=function(t){return i(t,t=>e(t).then(e=>{if(t.audio&&!e.getAudioTracks().length||t.video&&!e.getVideoTracks().length)throw e.getTracks().forEach(e=>{e.stop()}),new DOMException(``,`NotFoundError`);return e},e=>Promise.reject(a(e))))}}}var um=s({fixNegotiationNeeded:()=>vm,shimAddTrackRemoveTrack:()=>gm,shimAddTrackRemoveTrackWithNative:()=>hm,shimGetSendersWithDtmf:()=>pm,shimGetUserMedia:()=>lm,shimMediaStream:()=>dm,shimOnTrack:()=>fm,shimPeerConnection:()=>_m,shimSenderReceiverGetStats:()=>mm});function dm(e){e.MediaStream=e.MediaStream||e.webkitMediaStream}function fm(e,t){if(!(t.version>102))if(typeof e==`object`&&e.RTCPeerConnection&&!(`ontrack`in e.RTCPeerConnection.prototype)){Object.defineProperty(e.RTCPeerConnection.prototype,"ontrack",{get(){return this._ontrack},set(e){this._ontrack&&this.removeEventListener(`track`,this._ontrack),this.addEventListener(`track`,this._ontrack=e)},enumerable:!0,configurable:!0});let t=e.RTCPeerConnection.prototype.setRemoteDescription;e.RTCPeerConnection.prototype.setRemoteDescription=function(){return this._ontrackpoly||(this._ontrackpoly=t=>{t.stream.addEventListener(`addtrack`,n=>{let r;r=e.RTCPeerConnection.prototype.getReceivers?this.getReceivers().find(e=>e.track&&e.track.id===n.track.id):{track:n.track};let i=new Event(`track`);i.track=n.track,i.receiver=r,i.transceiver={receiver:r},i.streams=[t.stream],this.dispatchEvent(i)}),t.stream.getTracks().forEach(n=>{let r;r=e.RTCPeerConnection.prototype.getReceivers?this.getReceivers().find(e=>e.track&&e.track.id===n.id):{track:n};let i=new Event(`track`);i.track=n,i.receiver=r,i.transceiver={receiver:r},i.streams=[t.stream],this.dispatchEvent(i)})},this.addEventListener(`addstream`,this._ontrackpoly)),t.apply(this,arguments)}}else Qp(e,`track`,e=>(e.transceiver||Object.defineProperty(e,"transceiver",{value:{receiver:e.receiver}}),e))}function pm(e){if(typeof e==`object`&&e.RTCPeerConnection&&!(`getSenders`in e.RTCPeerConnection.prototype)&&`createDTMFSender`in e.RTCPeerConnection.prototype){let t=function(e,t){return{track:t,get dtmf(){return this._dtmf===void 0&&(t.kind===`audio`?this._dtmf=e.createDTMFSender(t):this._dtmf=null),this._dtmf},_pc:e}};if(!e.RTCPeerConnection.prototype.getSenders){e.RTCPeerConnection.prototype.getSenders=function(){return this._senders=this._senders||[],this._senders.slice()};let n=e.RTCPeerConnection.prototype.addTrack;e.RTCPeerConnection.prototype.addTrack=function(e,r){let i=n.apply(this,arguments);return i||(i=t(this,e),this._senders.push(i)),i};let r=e.RTCPeerConnection.prototype.removeTrack;e.RTCPeerConnection.prototype.removeTrack=function(e){r.apply(this,arguments);let t=this._senders.indexOf(e);t!==-1&&this._senders.splice(t,1)}}let n=e.RTCPeerConnection.prototype.addStream;e.RTCPeerConnection.prototype.addStream=function(e){this._senders=this._senders||[],n.apply(this,[e]),e.getTracks().forEach(e=>{this._senders.push(t(this,e))})};let r=e.RTCPeerConnection.prototype.removeStream;e.RTCPeerConnection.prototype.removeStream=function(e){this._senders=this._senders||[],r.apply(this,[e]),e.getTracks().forEach(e=>{let t=this._senders.find(t=>t.track===e);t&&this._senders.splice(this._senders.indexOf(t),1)})}}else if(typeof e==`object`&&e.RTCPeerConnection&&`getSenders`in e.RTCPeerConnection.prototype&&`createDTMFSender`in e.RTCPeerConnection.prototype&&e.RTCRtpSender&&!(`dtmf`in e.RTCRtpSender.prototype)){let t=e.RTCPeerConnection.prototype.getSenders;e.RTCPeerConnection.prototype.getSenders=function(){let e=t.apply(this,[]);return e.forEach(e=>e._pc=this),e},Object.defineProperty(e.RTCRtpSender.prototype,"dtmf",{get(){return this._dtmf===void 0&&(this.track.kind===`audio`?this._dtmf=this._pc.createDTMFSender(this.track):this._dtmf=null),this._dtmf}})}}function mm(e,t){if(t.version>=67||!(typeof e==`object`&&e.RTCPeerConnection&&e.RTCRtpSender&&e.RTCRtpReceiver))return;if(!(`getStats`in e.RTCRtpSender.prototype)){let t=e.RTCPeerConnection.prototype.getSenders;t&&(e.RTCPeerConnection.prototype.getSenders=function(){let e=t.apply(this,[]);return e.forEach(e=>e._pc=this),e});let n=e.RTCPeerConnection.prototype.addTrack;n&&(e.RTCPeerConnection.prototype.addTrack=function(){let e=n.apply(this,arguments);return e._pc=this,e}),e.RTCRtpSender.prototype.getStats=function(){let e=this;return this._pc.getStats().then(t=>sm(t,e.track,!0))}}if(!(`getStats`in e.RTCRtpReceiver.prototype)){let t=e.RTCPeerConnection.prototype.getReceivers;t&&(e.RTCPeerConnection.prototype.getReceivers=function(){let e=t.apply(this,[]);return e.forEach(e=>e._pc=this),e}),Qp(e,`track`,e=>(e.receiver._pc=e.srcElement,e)),e.RTCRtpReceiver.prototype.getStats=function(){let e=this;return this._pc.getStats().then(t=>sm(t,e.track,!1))}}if(!(`getStats`in e.RTCRtpSender.prototype&&`getStats`in e.RTCRtpReceiver.prototype))return;let n=e.RTCPeerConnection.prototype.getStats;e.RTCPeerConnection.prototype.getStats=function(){if(arguments.length>0&&arguments[0]instanceof e.MediaStreamTrack){let e=arguments[0],t,n,r;return this.getSenders().forEach(n=>{n.track===e&&(t?r=!0:t=n)}),this.getReceivers().forEach(t=>(t.track===e&&(n?r=!0:n=t),t.track===e)),r||t&&n?Promise.reject(new DOMException(`There are more than one sender or receiver for the track.`,`InvalidAccessError`)):t?t.getStats():n?n.getStats():Promise.reject(new DOMException(`There is no sender or receiver for the track.`,`InvalidAccessError`))}return n.apply(this,arguments)}}function hm(e){e.RTCPeerConnection.prototype.getLocalStreams=function(){return this._shimmedLocalStreams=this._shimmedLocalStreams||{},Object.keys(this._shimmedLocalStreams).map(e=>this._shimmedLocalStreams[e][0])};let t=e.RTCPeerConnection.prototype.addTrack;e.RTCPeerConnection.prototype.addTrack=function(e,n){if(!n)return t.apply(this,arguments);this._shimmedLocalStreams=this._shimmedLocalStreams||{};let r=t.apply(this,arguments);return this._shimmedLocalStreams[n.id]?this._shimmedLocalStreams[n.id].indexOf(r)===-1&&this._shimmedLocalStreams[n.id].push(r):this._shimmedLocalStreams[n.id]=[n,r],r};let n=e.RTCPeerConnection.prototype.addStream;e.RTCPeerConnection.prototype.addStream=function(e){this._shimmedLocalStreams=this._shimmedLocalStreams||{},e.getTracks().forEach(e=>{if(this.getSenders().find(t=>t.track===e))throw new DOMException(`Track already exists.`,`InvalidAccessError`)});let t=this.getSenders();n.apply(this,arguments);let r=this.getSenders().filter(e=>t.indexOf(e)===-1);this._shimmedLocalStreams[e.id]=[e].concat(r)};let r=e.RTCPeerConnection.prototype.removeStream;e.RTCPeerConnection.prototype.removeStream=function(e){return this._shimmedLocalStreams=this._shimmedLocalStreams||{},delete this._shimmedLocalStreams[e.id],r.apply(this,arguments)};let i=e.RTCPeerConnection.prototype.removeTrack;e.RTCPeerConnection.prototype.removeTrack=function(e){return this._shimmedLocalStreams=this._shimmedLocalStreams||{},e&&Object.keys(this._shimmedLocalStreams).forEach(t=>{let n=this._shimmedLocalStreams[t].indexOf(e);n!==-1&&this._shimmedLocalStreams[t].splice(n,1),this._shimmedLocalStreams[t].length===1&&delete this._shimmedLocalStreams[t]}),i.apply(this,arguments)}}function gm(e,t){if(!e.RTCPeerConnection)return;if(e.RTCPeerConnection.prototype.addTrack&&t.version>=65)return hm(e);let n=e.RTCPeerConnection.prototype.getLocalStreams;e.RTCPeerConnection.prototype.getLocalStreams=function(){let e=n.apply(this);return this._reverseStreams=this._reverseStreams||{},e.map(e=>this._reverseStreams[e.id])};let r=e.RTCPeerConnection.prototype.addStream;e.RTCPeerConnection.prototype.addStream=function(t){if(this._streams=this._streams||{},this._reverseStreams=this._reverseStreams||{},t.getTracks().forEach(e=>{if(this.getSenders().find(t=>t.track===e))throw new DOMException(`Track already exists.`,`InvalidAccessError`)}),!this._reverseStreams[t.id]){let n=new e.MediaStream(t.getTracks());this._streams[t.id]=n,this._reverseStreams[n.id]=t,t=n}r.apply(this,[t])};let i=e.RTCPeerConnection.prototype.removeStream;e.RTCPeerConnection.prototype.removeStream=function(e){this._streams=this._streams||{},this._reverseStreams=this._reverseStreams||{},i.apply(this,[this._streams[e.id]||e]),delete this._reverseStreams[this._streams[e.id]?this._streams[e.id].id:e.id],delete this._streams[e.id]},e.RTCPeerConnection.prototype.addTrack=function(t,n){if(this.signalingState===`closed`)throw new DOMException(`The RTCPeerConnection's signalingState is 'closed'.`,`InvalidStateError`);let r=[].slice.call(arguments,1);if(r.length!==1||!r[0].getTracks().find(e=>e===t))throw new DOMException(`The adapter.js addTrack polyfill only supports a single  stream which is associated with the specified track.`,`NotSupportedError`);if(this.getSenders().find(e=>e.track===t))throw new DOMException(`Track already exists.`,`InvalidAccessError`);this._streams=this._streams||{},this._reverseStreams=this._reverseStreams||{};let i=this._streams[n.id];if(i)i.addTrack(t),Promise.resolve().then(()=>{this.dispatchEvent(new Event(`negotiationneeded`))});else{let r=new e.MediaStream([t]);this._streams[n.id]=r,this._reverseStreams[r.id]=n,this.addStream(r)}return this.getSenders().find(e=>e.track===t)};function a(e,t){let n=t.sdp;return Object.keys(e._reverseStreams||[]).forEach(t=>{let r=e._reverseStreams[t],i=e._streams[r.id];n=n.replace(new RegExp(i.id,`g`),r.id)}),new RTCSessionDescription({type:t.type,sdp:n})}function o(e,t){let n=t.sdp;return Object.keys(e._reverseStreams||[]).forEach(t=>{let r=e._reverseStreams[t],i=e._streams[r.id];n=n.replace(new RegExp(r.id,`g`),i.id)}),new RTCSessionDescription({type:t.type,sdp:n})}[`createOffer`,`createAnswer`].forEach(function(t){let n=e.RTCPeerConnection.prototype[t],r={[t](){let e=arguments;return arguments.length&&typeof arguments[0]==`function`?n.apply(this,[t=>{let n=a(this,t);e[0].apply(null,[n])},t=>{e[1]&&e[1].apply(null,t)},arguments[2]]):n.apply(this,arguments).then(e=>a(this,e))}};e.RTCPeerConnection.prototype[t]=r[t]});let s=e.RTCPeerConnection.prototype.setLocalDescription;e.RTCPeerConnection.prototype.setLocalDescription=function(){return!arguments.length||!arguments[0].type||(arguments[0]=o(this,arguments[0])),s.apply(this,arguments)};let c=Object.getOwnPropertyDescriptor(e.RTCPeerConnection.prototype,`localDescription`);Object.defineProperty(e.RTCPeerConnection.prototype,"localDescription",{get(){let e=c.get.apply(this);return e.type===``?e:a(this,e)}}),e.RTCPeerConnection.prototype.removeTrack=function(e){if(this.signalingState===`closed`)throw new DOMException(`The RTCPeerConnection's signalingState is 'closed'.`,`InvalidStateError`);if(!e._pc)throw new DOMException(`Argument 1 of RTCPeerConnection.removeTrack does not implement interface RTCRtpSender.`,`TypeError`);if(e._pc!==this)throw new DOMException(`Sender was not created by this connection.`,`InvalidAccessError`);this._streams=this._streams||{};let t;Object.keys(this._streams).forEach(n=>{this._streams[n].getTracks().find(t=>e.track===t)&&(t=this._streams[n])}),t&&(t.getTracks().length===1?this.removeStream(this._reverseStreams[t.id]):t.removeTrack(e.track),this.dispatchEvent(new Event(`negotiationneeded`)))}}function _m(e,t){!e.RTCPeerConnection&&e.webkitRTCPeerConnection&&(e.RTCPeerConnection=e.webkitRTCPeerConnection),e.RTCPeerConnection&&t.version<53&&[`setLocalDescription`,`setRemoteDescription`,`addIceCandidate`].forEach(function(t){let n=e.RTCPeerConnection.prototype[t],r={[t](){return arguments[0]=new(t===`addIceCandidate`?e.RTCIceCandidate:e.RTCSessionDescription)(arguments[0]),n.apply(this,arguments)}};e.RTCPeerConnection.prototype[t]=r[t]})}function vm(e,t){t.version>102||Qp(e,`negotiationneeded`,e=>{let n=e.target;if(!((t.version<72||n.getConfiguration&&n.getConfiguration().sdpSemantics===`plan-b`)&&n.signalingState!==`stable`))return e})}function ym(e,t){let n=e&&e.navigator;if(!n.mediaDevices)return;let r=e&&e.MediaStreamTrack;if(n.getUserMedia=function(e,t,r){nm(`navigator.getUserMedia`,`navigator.mediaDevices.getUserMedia`),n.mediaDevices.getUserMedia(e).then(t,r)},!(t.version>55&&`autoGainControl`in n.mediaDevices.getSupportedConstraints())){let e=function(e,t,n){t in e&&!(n in e)&&(e[n]=e[t],delete e[t])},t=n.mediaDevices.getUserMedia.bind(n.mediaDevices);if(n.mediaDevices.getUserMedia=function(n){return typeof n==`object`&&typeof n.audio==`object`&&(n=JSON.parse(JSON.stringify(n)),e(n.audio,`autoGainControl`,`mozAutoGainControl`),e(n.audio,`noiseSuppression`,`mozNoiseSuppression`)),t(n)},r&&r.prototype.getSettings){let t=r.prototype.getSettings;r.prototype.getSettings=function(){let n=t.apply(this,arguments);return e(n,`mozAutoGainControl`,`autoGainControl`),e(n,`mozNoiseSuppression`,`noiseSuppression`),n}}if(r&&r.prototype.applyConstraints){let t=r.prototype.applyConstraints;r.prototype.applyConstraints=function(n){return this.kind===`audio`&&typeof n==`object`&&(n=JSON.parse(JSON.stringify(n)),e(n,`autoGainControl`,`mozAutoGainControl`),e(n,`noiseSuppression`,`mozNoiseSuppression`)),t.apply(this,[n])}}}}function bm(e,t){e.navigator.mediaDevices&&(e.navigator.mediaDevices&&`getDisplayMedia`in e.navigator.mediaDevices||(e.navigator.mediaDevices.getDisplayMedia=function(n){if(!(n&&n.video)){let e=new DOMException(`getDisplayMedia without video constraints is undefined`);return e.name=`NotFoundError`,e.code=8,Promise.reject(e)}return n.video===!0?n.video={mediaSource:t}:n.video.mediaSource=t,e.navigator.mediaDevices.getUserMedia(n)}))}var xm=s({shimAddTransceiver:()=>km,shimCreateAnswer:()=>Mm,shimCreateOffer:()=>jm,shimGetDisplayMedia:()=>bm,shimGetParameters:()=>Am,shimGetStats:()=>wm,shimGetUserMedia:()=>ym,shimOnTrack:()=>Sm,shimPeerConnection:()=>Cm,shimRTCDataChannel:()=>Om,shimReceiverGetStats:()=>Em,shimRemoveStream:()=>Dm,shimSenderGetStats:()=>Tm});function Sm(e){typeof e==`object`&&e.RTCTrackEvent&&`receiver`in e.RTCTrackEvent.prototype&&!(`transceiver`in e.RTCTrackEvent.prototype)&&Object.defineProperty(e.RTCTrackEvent.prototype,"transceiver",{get(){return{receiver:this.receiver}}})}function Cm(e,t){typeof e!=`object`||!(e.RTCPeerConnection||e.mozRTCPeerConnection)||(!e.RTCPeerConnection&&e.mozRTCPeerConnection&&(e.RTCPeerConnection=e.mozRTCPeerConnection),t.version<53&&[`setLocalDescription`,`setRemoteDescription`,`addIceCandidate`].forEach(function(t){let n=e.RTCPeerConnection.prototype[t],r={[t](){return arguments[0]=new(t===`addIceCandidate`?e.RTCIceCandidate:e.RTCSessionDescription)(arguments[0]),n.apply(this,arguments)}};e.RTCPeerConnection.prototype[t]=r[t]}))}function wm(e,t){if(typeof e!=`object`||!(e.RTCPeerConnection||e.mozRTCPeerConnection)||t.version>=151)return;let n={inboundrtp:`inbound-rtp`,outboundrtp:`outbound-rtp`,candidatepair:`candidate-pair`,localcandidate:`local-candidate`,remotecandidate:`remote-candidate`},r=e.RTCPeerConnection.prototype.getStats;e.RTCPeerConnection.prototype.getStats=function(){let[e,i,a]=arguments;return this.signalingState===`closed`?Promise.resolve(new Map):r.apply(this,[e||null]).then(e=>{if(t.version<53&&!i)try{e.forEach(e=>{e.type=n[e.type]||e.type})}catch(t){if(t.name!==`TypeError`)throw t;e.forEach((t,r)=>{e.set(r,Object.assign({},t,{type:n[t.type]||t.type}))})}return e}).then(i,a)}}function Tm(e){if(!(typeof e==`object`&&e.RTCPeerConnection&&e.RTCRtpSender)||e.RTCRtpSender&&`getStats`in e.RTCRtpSender.prototype)return;let t=e.RTCPeerConnection.prototype.getSenders;t&&(e.RTCPeerConnection.prototype.getSenders=function(){let e=t.apply(this,[]);return e.forEach(e=>e._pc=this),e});let n=e.RTCPeerConnection.prototype.addTrack;n&&(e.RTCPeerConnection.prototype.addTrack=function(){let e=n.apply(this,arguments);return e._pc=this,e}),e.RTCRtpSender.prototype.getStats=function(){return this.track?this._pc.getStats(this.track):Promise.resolve(new Map)}}function Em(e){if(!(typeof e==`object`&&e.RTCPeerConnection&&e.RTCRtpSender)||e.RTCRtpSender&&`getStats`in e.RTCRtpReceiver.prototype)return;let t=e.RTCPeerConnection.prototype.getReceivers;t&&(e.RTCPeerConnection.prototype.getReceivers=function(){let e=t.apply(this,[]);return e.forEach(e=>e._pc=this),e}),Qp(e,`track`,e=>(e.receiver._pc=e.srcElement,e)),e.RTCRtpReceiver.prototype.getStats=function(){return this._pc.getStats(this.track)}}function Dm(e){!e.RTCPeerConnection||`removeStream`in e.RTCPeerConnection.prototype||(e.RTCPeerConnection.prototype.removeStream=function(e){nm(`removeStream`,`removeTrack`),this.getSenders().forEach(t=>{t.track&&e.getTracks().includes(t.track)&&this.removeTrack(t)})})}function Om(e){e.DataChannel&&!e.RTCDataChannel&&(e.RTCDataChannel=e.DataChannel)}function km(e,t){if(!(typeof e==`object`&&e.RTCPeerConnection)||t.version>=110)return;let n=e.RTCPeerConnection.prototype.addTransceiver;n&&(e.RTCPeerConnection.prototype.addTransceiver=function(){this.setParametersPromises=[];let e=arguments[1]&&arguments[1].sendEncodings;e===void 0&&(e=[]),e=[...e];let t=e.length>0;t&&e.forEach(e=>{if(`rid`in e&&!/^[a-z0-9]{0,16}$/i.test(e.rid))throw TypeError(`Invalid RID value provided.`);if(`scaleResolutionDownBy`in e&&!(parseFloat(e.scaleResolutionDownBy)>=1))throw RangeError(`scale_resolution_down_by must be >= 1.0`);if(`maxFramerate`in e&&!(parseFloat(e.maxFramerate)>=0))throw RangeError(`max_framerate must be >= 0.0`)});let r=n.apply(this,arguments);if(t){let{sender:t}=r,n=t.getParameters();(!(`encodings`in n)||n.encodings.length===1&&Object.keys(n.encodings[0]).length===0)&&(n.encodings=e,t.sendEncodings=e,this.setParametersPromises.push(t.setParameters(n).then(()=>{delete t.sendEncodings}).catch(()=>{delete t.sendEncodings})))}return r})}function Am(e,t){if(!(typeof e==`object`&&e.RTCRtpSender)||t.version>=110)return;let n=e.RTCRtpSender.prototype.getParameters;n&&(e.RTCRtpSender.prototype.getParameters=function(){let e=n.apply(this,arguments);return`encodings`in e||(e.encodings=[].concat(this.sendEncodings||[{}])),e})}function jm(e,t){if(!(typeof e==`object`&&e.RTCPeerConnection)||t.version>=110)return;let n=e.RTCPeerConnection.prototype.createOffer;e.RTCPeerConnection.prototype.createOffer=function(){return this.setParametersPromises&&this.setParametersPromises.length?Promise.all(this.setParametersPromises).then(()=>n.apply(this,arguments)).finally(()=>{this.setParametersPromises=[]}):n.apply(this,arguments)}}function Mm(e,t){if(!(typeof e==`object`&&e.RTCPeerConnection)||t.version>=110)return;let n=e.RTCPeerConnection.prototype.createAnswer;e.RTCPeerConnection.prototype.createAnswer=function(){return this.setParametersPromises&&this.setParametersPromises.length?Promise.all(this.setParametersPromises).then(()=>n.apply(this,arguments)).finally(()=>{this.setParametersPromises=[]}):n.apply(this,arguments)}}var Nm=s({shimAudioContext:()=>Hm,shimCallbacksAPI:()=>Im,shimConstraints:()=>Rm,shimCreateOfferLegacy:()=>Vm,shimGetUserMedia:()=>Lm,shimLocalStreamsAPI:()=>Pm,shimRTCIceServerUrls:()=>zm,shimRemoteStreamsAPI:()=>Fm,shimTrackEventTransceiver:()=>Bm});function Pm(e){if(!(typeof e!=`object`||!e.RTCPeerConnection)){if(`getLocalStreams`in e.RTCPeerConnection.prototype||(e.RTCPeerConnection.prototype.getLocalStreams=function(){return this._localStreams||=[],this._localStreams}),!(`addStream`in e.RTCPeerConnection.prototype)){let t=e.RTCPeerConnection.prototype.addTrack;e.RTCPeerConnection.prototype.addStream=function(e){this._localStreams||=[],this._localStreams.includes(e)||this._localStreams.push(e),e.getAudioTracks().forEach(n=>t.call(this,n,e)),e.getVideoTracks().forEach(n=>t.call(this,n,e))},e.RTCPeerConnection.prototype.addTrack=function(e,...n){return n&&n.forEach(e=>{this._localStreams?this._localStreams.includes(e)||this._localStreams.push(e):this._localStreams=[e]}),t.apply(this,arguments)}}`removeStream`in e.RTCPeerConnection.prototype||(e.RTCPeerConnection.prototype.removeStream=function(e){this._localStreams||=[];let t=this._localStreams.indexOf(e);if(t===-1)return;this._localStreams.splice(t,1);let n=e.getTracks();this.getSenders().forEach(e=>{n.includes(e.track)&&this.removeTrack(e)})})}}function Fm(e){if(!(typeof e!=`object`||!e.RTCPeerConnection)&&(`getRemoteStreams`in e.RTCPeerConnection.prototype||(e.RTCPeerConnection.prototype.getRemoteStreams=function(){return this._remoteStreams?this._remoteStreams:[]}),!(`onaddstream`in e.RTCPeerConnection.prototype))){Object.defineProperty(e.RTCPeerConnection.prototype,"onaddstream",{get(){return this._onaddstream},set(e){this._onaddstream&&(this.removeEventListener(`addstream`,this._onaddstream),this.removeEventListener(`track`,this._onaddstreampoly)),this.addEventListener(`addstream`,this._onaddstream=e),this.addEventListener(`track`,this._onaddstreampoly=e=>{e.streams.forEach(e=>{if(this._remoteStreams||=[],this._remoteStreams.includes(e))return;this._remoteStreams.push(e);let t=new Event(`addstream`);t.stream=e,this.dispatchEvent(t)})})}});let t=e.RTCPeerConnection.prototype.setRemoteDescription;e.RTCPeerConnection.prototype.setRemoteDescription=function(){let e=this;return this._onaddstreampoly||this.addEventListener(`track`,this._onaddstreampoly=function(t){t.streams.forEach(t=>{if(e._remoteStreams||=[],e._remoteStreams.indexOf(t)>=0)return;e._remoteStreams.push(t);let n=new Event(`addstream`);n.stream=t,e.dispatchEvent(n)})}),t.apply(e,arguments)}}}function Im(e){if(typeof e!=`object`||!e.RTCPeerConnection)return;let t=e.RTCPeerConnection.prototype,n=t.createOffer,r=t.createAnswer,i=t.setLocalDescription,a=t.setRemoteDescription,o=t.addIceCandidate;t.createOffer=function(e,t){let r=arguments.length>=2?arguments[2]:arguments[0],i=n.apply(this,[r]);return t?(i.then(e,t),Promise.resolve()):i},t.createAnswer=function(e,t){let n=arguments.length>=2?arguments[2]:arguments[0],i=r.apply(this,[n]);return t?(i.then(e,t),Promise.resolve()):i};let s=function(e,t,n){let r=i.apply(this,[e]);return n?(r.then(t,n),Promise.resolve()):r};t.setLocalDescription=s,s=function(e,t,n){let r=a.apply(this,[e]);return n?(r.then(t,n),Promise.resolve()):r},t.setRemoteDescription=s,s=function(e,t,n){let r=o.apply(this,[e]);return n?(r.then(t,n),Promise.resolve()):r},t.addIceCandidate=s}function Lm(e){let t=e&&e.navigator;if(t.mediaDevices&&t.mediaDevices.getUserMedia){let e=t.mediaDevices,n=e.getUserMedia.bind(e);t.mediaDevices.getUserMedia=e=>n(Rm(e))}!t.getUserMedia&&t.mediaDevices&&t.mediaDevices.getUserMedia&&(t.getUserMedia=function(e,n,r){t.mediaDevices.getUserMedia(e).then(n,r)}.bind(t))}function Rm(e){return e&&e.video!==void 0?Object.assign({},e,{video:am(e.video)}):e}function zm(e){if(!e.RTCPeerConnection)return;let t=e.RTCPeerConnection;e.RTCPeerConnection=function(e,n){if(e&&e.iceServers){let t=[];for(let n=0;n<e.iceServers.length;n++){let r=e.iceServers[n];r.urls===void 0&&r.url?(nm(`RTCIceServer.url`,`RTCIceServer.urls`),r=JSON.parse(JSON.stringify(r)),r.urls=r.url,delete r.url,t.push(r)):t.push(e.iceServers[n])}e.iceServers=t}return new t(e,n)},e.RTCPeerConnection.prototype=t.prototype,`generateCertificate`in t&&Object.defineProperty(e.RTCPeerConnection,"generateCertificate",{get(){return t.generateCertificate}})}function Bm(e){typeof e==`object`&&e.RTCTrackEvent&&`receiver`in e.RTCTrackEvent.prototype&&!(`transceiver`in e.RTCTrackEvent.prototype)&&Object.defineProperty(e.RTCTrackEvent.prototype,"transceiver",{get(){return{receiver:this.receiver}}})}function Vm(e){let t=e.RTCPeerConnection.prototype.createOffer;e.RTCPeerConnection.prototype.createOffer=function(e){if(e){e.offerToReceiveAudio!==void 0&&(e.offerToReceiveAudio=!!e.offerToReceiveAudio);let t=this.getTransceivers().find(e=>e.receiver.track.kind===`audio`);e.offerToReceiveAudio===!1&&t?t.direction===`sendrecv`?t.setDirection?t.setDirection(`sendonly`):t.direction=`sendonly`:t.direction===`recvonly`&&(t.setDirection?t.setDirection(`inactive`):t.direction=`inactive`):e.offerToReceiveAudio===!0&&!t&&this.addTransceiver(`audio`,{direction:`recvonly`}),e.offerToReceiveVideo!==void 0&&(e.offerToReceiveVideo=!!e.offerToReceiveVideo);let n=this.getTransceivers().find(e=>e.receiver.track.kind===`video`);e.offerToReceiveVideo===!1&&n?n.direction===`sendrecv`?n.setDirection?n.setDirection(`sendonly`):n.direction=`sendonly`:n.direction===`recvonly`&&(n.setDirection?n.setDirection(`inactive`):n.direction=`inactive`):e.offerToReceiveVideo===!0&&!n&&this.addTransceiver(`video`,{direction:`recvonly`})}return t.apply(this,arguments)}}function Hm(e){typeof e!=`object`||e.AudioContext||(e.AudioContext=e.webkitAudioContext)}var Um=o(((e,t)=>{var n={};n.generateIdentifier=function(){return Math.random().toString(36).substring(2,12)},n.localCName=n.generateIdentifier(),n.splitLines=function(e){return e.trim().split(`
`).map(e=>e.trim())},n.splitSections=function(e){return e.split(`
m=`).map((e,t)=>(t>0?`m=`+e:e).trim()+`\r
`)},n.getDescription=function(e){let t=n.splitSections(e);return t&&t[0]},n.getMediaSections=function(e){let t=n.splitSections(e);return t.shift(),t},n.matchPrefix=function(e,t){return n.splitLines(e).filter(e=>e.indexOf(t)===0)},n.parseCandidate=function(e){let t;t=e.indexOf(`a=candidate:`)===0?e.substring(12).split(` `):e.substring(10).split(` `);let n={foundation:t[0],component:{1:`rtp`,2:`rtcp`}[t[1]]||t[1],protocol:t[2].toLowerCase(),priority:parseInt(t[3],10),ip:t[4],address:t[4],port:parseInt(t[5],10),type:t[7]};for(let e=8;e<t.length;e+=2)switch(t[e]){case`raddr`:n.relatedAddress=t[e+1];break;case`rport`:n.relatedPort=parseInt(t[e+1],10);break;case`tcptype`:n.tcpType=t[e+1];break;case`ufrag`:n.ufrag=t[e+1],n.usernameFragment=t[e+1];break;default:n[t[e]]===void 0&&(n[t[e]]=t[e+1]);break}return n},n.writeCandidate=function(e){let t=[];t.push(e.foundation);let n=e.component;n===`rtp`?t.push(1):n===`rtcp`?t.push(2):t.push(n),t.push(e.protocol.toUpperCase()),t.push(e.priority),t.push(e.address||e.ip),t.push(e.port);let r=e.type;return t.push(`typ`),t.push(r),r!==`host`&&e.relatedAddress&&e.relatedPort!==void 0&&(t.push(`raddr`),t.push(e.relatedAddress),t.push(`rport`),t.push(e.relatedPort)),e.tcpType&&e.protocol.toLowerCase()===`tcp`&&(t.push(`tcptype`),t.push(e.tcpType)),(e.usernameFragment||e.ufrag)&&(t.push(`ufrag`),t.push(e.usernameFragment||e.ufrag)),`candidate:`+t.join(` `)},n.parseIceOptions=function(e){return e.substring(14).split(` `)},n.parseRtpMap=function(e){let t=e.substring(9).split(` `),n={payloadType:parseInt(t.shift(),10)};return t=t[0].split(`/`),n.name=t[0],n.clockRate=parseInt(t[1],10),n.channels=t.length===3?parseInt(t[2],10):1,n.numChannels=n.channels,n},n.writeRtpMap=function(e){let t=e.payloadType;e.preferredPayloadType!==void 0&&(t=e.preferredPayloadType);let n=e.channels||e.numChannels||1;return`a=rtpmap:`+t+` `+e.name+`/`+e.clockRate+(n===1?``:`/`+n)+`\r
`},n.parseExtmap=function(e){let t=e.substring(9).split(` `);return{id:parseInt(t[0],10),direction:t[0].indexOf(`/`)>0?t[0].split(`/`)[1]:`sendrecv`,uri:t[1],attributes:t.slice(2).join(` `)}},n.writeExtmap=function(e){return`a=extmap:`+(e.id||e.preferredId)+(e.direction&&e.direction!==`sendrecv`?`/`+e.direction:``)+` `+e.uri+(e.attributes?` `+e.attributes:``)+`\r
`},n.parseFmtp=function(e){let t={},n,r=e.substring(e.indexOf(` `)+1).split(`;`);for(let e=0;e<r.length;e++)n=r[e].trim().split(`=`),t[n[0].trim()]=n[1];return t},n.writeFmtp=function(e){let t=``,n=e.payloadType;if(e.preferredPayloadType!==void 0&&(n=e.preferredPayloadType),e.parameters&&Object.keys(e.parameters).length){let r=[];Object.keys(e.parameters).forEach(t=>{e.parameters[t]===void 0?r.push(t):r.push(t+`=`+e.parameters[t])}),t+=`a=fmtp:`+n+` `+r.join(`;`)+`\r
`}return t},n.parseRtcpFb=function(e){let t=e.substring(e.indexOf(` `)+1).split(` `);return{type:t.shift(),parameter:t.join(` `)}},n.writeRtcpFb=function(e){let t=``,n=e.payloadType;return e.preferredPayloadType!==void 0&&(n=e.preferredPayloadType),e.rtcpFeedback&&e.rtcpFeedback.length&&e.rtcpFeedback.forEach(e=>{t+=`a=rtcp-fb:`+n+` `+e.type+(e.parameter&&e.parameter.length?` `+e.parameter:``)+`\r
`}),t},n.parseSsrcMedia=function(e){let t=e.indexOf(` `),n={ssrc:parseInt(e.substring(7,t),10)},r=e.indexOf(`:`,t);return r>-1?(n.attribute=e.substring(t+1,r),n.value=e.substring(r+1)):n.attribute=e.substring(t+1),n},n.parseSsrcGroup=function(e){let t=e.substring(13).split(` `);return{semantics:t.shift(),ssrcs:t.map(e=>parseInt(e,10))}},n.getMid=function(e){let t=n.matchPrefix(e,`a=mid:`)[0];if(t)return t.substring(6)},n.parseFingerprint=function(e){let t=e.substring(14).split(` `);return{algorithm:t[0].toLowerCase(),value:t[1].toUpperCase()}},n.getDtlsParameters=function(e,t){return{role:`auto`,fingerprints:n.matchPrefix(e+t,`a=fingerprint:`).map(n.parseFingerprint)}},n.writeDtlsParameters=function(e,t){let n=`a=setup:`+t+`\r
`;return e.fingerprints.forEach(e=>{n+=`a=fingerprint:`+e.algorithm+` `+e.value+`\r
`}),n},n.parseCryptoLine=function(e){let t=e.substring(9).split(` `);return{tag:parseInt(t[0],10),cryptoSuite:t[1],keyParams:t[2],sessionParams:t.slice(3)}},n.writeCryptoLine=function(e){return`a=crypto:`+e.tag+` `+e.cryptoSuite+` `+(typeof e.keyParams==`object`?n.writeCryptoKeyParams(e.keyParams):e.keyParams)+(e.sessionParams?` `+e.sessionParams.join(` `):``)+`\r
`},n.parseCryptoKeyParams=function(e){if(e.indexOf(`inline:`)!==0)return null;let t=e.substring(7).split(`|`);return{keyMethod:`inline`,keySalt:t[0],lifeTime:t[1],mkiValue:t[2]?t[2].split(`:`)[0]:void 0,mkiLength:t[2]?t[2].split(`:`)[1]:void 0}},n.writeCryptoKeyParams=function(e){return e.keyMethod+`:`+e.keySalt+(e.lifeTime?`|`+e.lifeTime:``)+(e.mkiValue&&e.mkiLength?`|`+e.mkiValue+`:`+e.mkiLength:``)},n.getCryptoParameters=function(e,t){return n.matchPrefix(e+t,`a=crypto:`).map(n.parseCryptoLine)},n.getIceParameters=function(e,t){let r=n.matchPrefix(e+t,`a=ice-ufrag:`)[0],i=n.matchPrefix(e+t,`a=ice-pwd:`)[0];return r&&i?{usernameFragment:r.substring(12),password:i.substring(10)}:null},n.writeIceParameters=function(e){let t=`a=ice-ufrag:`+e.usernameFragment+`\r
a=ice-pwd:`+e.password+`\r
`;return e.iceLite&&(t+=`a=ice-lite\r
`),t},n.parseRtpParameters=function(e){let t={codecs:[],headerExtensions:[],fecMechanisms:[],rtcp:[]},r=n.splitLines(e)[0].split(` `);t.profile=r[2];for(let i=3;i<r.length;i++){let a=r[i],o=n.matchPrefix(e,`a=rtpmap:`+a+` `)[0];if(o){let r=n.parseRtpMap(o),i=n.matchPrefix(e,`a=fmtp:`+a+` `);switch(r.parameters=i.length?n.parseFmtp(i[0]):{},r.rtcpFeedback=n.matchPrefix(e,`a=rtcp-fb:`+a+` `).map(n.parseRtcpFb),t.codecs.push(r),r.name.toUpperCase()){case`RED`:case`ULPFEC`:t.fecMechanisms.push(r.name.toUpperCase());break;default:break}}}n.matchPrefix(e,`a=extmap:`).forEach(e=>{t.headerExtensions.push(n.parseExtmap(e))});let i=n.matchPrefix(e,`a=rtcp-fb:* `).map(n.parseRtcpFb);return t.codecs.forEach(e=>{i.forEach(t=>{e.rtcpFeedback.find(e=>e.type===t.type&&e.parameter===t.parameter)||e.rtcpFeedback.push(t)})}),t},n.writeRtpDescription=function(e,t){let r=``;r+=`m=`+e+` `,r+=t.codecs.length>0?`9`:`0`,r+=` `+(t.profile||`UDP/TLS/RTP/SAVPF`)+` `,r+=t.codecs.map(e=>e.preferredPayloadType===void 0?e.payloadType:e.preferredPayloadType).join(` `)+`\r
`,r+=`c=IN IP4 0.0.0.0\r
`,r+=`a=rtcp:9 IN IP4 0.0.0.0\r
`,t.codecs.forEach(e=>{r+=n.writeRtpMap(e),r+=n.writeFmtp(e),r+=n.writeRtcpFb(e)});let i=0;return t.codecs.forEach(e=>{e.maxptime>i&&(i=e.maxptime)}),i>0&&(r+=`a=maxptime:`+i+`\r
`),t.headerExtensions&&t.headerExtensions.forEach(e=>{r+=n.writeExtmap(e)}),r},n.parseRtpEncodingParameters=function(e){let t=[],r=n.parseRtpParameters(e),i=r.fecMechanisms.indexOf(`RED`)!==-1,a=r.fecMechanisms.indexOf(`ULPFEC`)!==-1,o=n.matchPrefix(e,`a=ssrc:`).map(e=>n.parseSsrcMedia(e)).filter(e=>e.attribute===`cname`),s=o.length>0&&o[0].ssrc,c,l=n.matchPrefix(e,`a=ssrc-group:FID`).map(e=>e.substring(17).split(` `).map(e=>parseInt(e,10)));l.length>0&&l[0].length>1&&l[0][0]===s&&(c=l[0][1]),r.codecs.forEach(e=>{if(e.name.toUpperCase()===`RTX`&&e.parameters.apt){let n={ssrc:s,codecPayloadType:parseInt(e.parameters.apt,10)};s&&c&&(n.rtx={ssrc:c}),t.push(n),i&&(n=JSON.parse(JSON.stringify(n)),n.fec={ssrc:s,mechanism:a?`red+ulpfec`:`red`},t.push(n))}}),t.length===0&&s&&t.push({ssrc:s});let u=n.matchPrefix(e,`b=`);return u.length&&(u=u[0].indexOf(`b=TIAS:`)===0?parseInt(u[0].substring(7),10):u[0].indexOf(`b=AS:`)===0?parseInt(u[0].substring(5),10)*1e3*.95-2e3*8:void 0,t.forEach(e=>{e.maxBitrate=u})),t},n.parseRtcpParameters=function(e){let t={},r=n.matchPrefix(e,`a=ssrc:`).map(e=>n.parseSsrcMedia(e)).filter(e=>e.attribute===`cname`)[0];r&&(t.cname=r.value,t.ssrc=r.ssrc);let i=n.matchPrefix(e,`a=rtcp-rsize`);return t.reducedSize=i.length>0,t.compound=i.length===0,t.mux=n.matchPrefix(e,`a=rtcp-mux`).length>0,t},n.writeRtcpParameters=function(e){let t=``;return e.reducedSize&&(t+=`a=rtcp-rsize\r
`),e.mux&&(t+=`a=rtcp-mux\r
`),e.ssrc!==void 0&&e.cname&&(t+=`a=ssrc:`+e.ssrc+` cname:`+e.cname+`\r
`),t},n.parseMsid=function(e){let t,r=n.matchPrefix(e,`a=msid:`);if(r.length===1)return t=r[0].substring(7).split(` `),{stream:t[0],track:t[1]};let i=n.matchPrefix(e,`a=ssrc:`).map(e=>n.parseSsrcMedia(e)).filter(e=>e.attribute===`msid`);if(i.length>0)return t=i[0].value.split(` `),{stream:t[0],track:t[1]}},n.parseSctpDescription=function(e){let t=n.parseMLine(e),r=n.matchPrefix(e,`a=max-message-size:`),i;r.length>0&&(i=parseInt(r[0].substring(19),10)),isNaN(i)&&(i=65536);let a=n.matchPrefix(e,`a=sctp-port:`);if(a.length>0)return{port:parseInt(a[0].substring(12),10),protocol:t.fmt,maxMessageSize:i};let o=n.matchPrefix(e,`a=sctpmap:`);if(o.length>0){let e=o[0].substring(10).split(` `);return{port:parseInt(e[0],10),protocol:e[1],maxMessageSize:i}}},n.writeSctpDescription=function(e,t){let n=[];return n=e.protocol===`DTLS/SCTP`?[`m=`+e.kind+` 9 `+e.protocol+` `+t.port+`\r
`,`c=IN IP4 0.0.0.0\r
`,`a=sctpmap:`+t.port+` `+t.protocol+` 65535\r
`]:[`m=`+e.kind+` 9 `+e.protocol+` `+t.protocol+`\r
`,`c=IN IP4 0.0.0.0\r
`,`a=sctp-port:`+t.port+`\r
`],t.maxMessageSize!==void 0&&n.push(`a=max-message-size:`+t.maxMessageSize+`\r
`),n.join(``)},n.generateSessionId=function(){return Math.random().toString().substr(2,22)},n.writeSessionBoilerplate=function(e,t,r){let i,a=t===void 0?2:t;return i=e||n.generateSessionId(),`v=0\r
o=`+(r||`thisisadapterortc`)+` `+i+` `+a+` IN IP4 127.0.0.1\r
s=-\r
t=0 0\r
`},n.getDirection=function(e,t){let r=n.splitLines(e);for(let e=0;e<r.length;e++)switch(r[e]){case`a=sendrecv`:case`a=sendonly`:case`a=recvonly`:case`a=inactive`:return r[e].substring(2);default:}return t?n.getDirection(t):`sendrecv`},n.getKind=function(e){return n.splitLines(e)[0].split(` `)[0].substring(2)},n.isRejected=function(e){return e.split(` `,2)[1]===`0`},n.parseMLine=function(e){let t=n.splitLines(e)[0].substring(2).split(` `);return{kind:t[0],port:parseInt(t[1],10),protocol:t[2],fmt:t.slice(3).join(` `)}},n.parseOLine=function(e){let t=n.matchPrefix(e,`o=`)[0].substring(2).split(` `);return{username:t[0],sessionId:t[1],sessionVersion:parseInt(t[2],10),netType:t[3],addressType:t[4],address:t[5]}},n.isValidSDP=function(e){if(typeof e!=`string`||e.length===0)return!1;let t=n.splitLines(e);for(let e=0;e<t.length;e++)if(t[e].length<2||t[e].charAt(1)!==`=`)return!1;return!0},typeof t==`object`&&(t.exports=n)})),Wm=s({removeExtmapAllowMixed:()=>Zm,shimAddIceCandidateNullOrEmpty:()=>Qm,shimConnectionState:()=>Xm,shimMaxMessageSize:()=>Jm,shimParameterlessSetLocalDescription:()=>$m,shimRTCIceCandidate:()=>Km,shimRTCIceCandidateRelayProtocol:()=>qm,shimSendThrowTypeError:()=>Ym}),Gm=l(Um());function Km(e){if(!e.RTCIceCandidate||e.RTCIceCandidate&&`foundation`in e.RTCIceCandidate.prototype)return;let t=e.RTCIceCandidate;e.RTCIceCandidate=function(e){if(typeof e==`object`&&e.candidate&&e.candidate.indexOf(`a=`)===0&&(e=JSON.parse(JSON.stringify(e)),e.candidate=e.candidate.substring(2)),e.candidate&&e.candidate.length){let n=new t(e),r=Gm.default.parseCandidate(e.candidate);for(let e in r)e in n||Object.defineProperty(n,e,{value:r[e]});return n.toJSON=function(){return{candidate:n.candidate,sdpMid:n.sdpMid,sdpMLineIndex:n.sdpMLineIndex,usernameFragment:n.usernameFragment}},n}return new t(e)},e.RTCIceCandidate.prototype=t.prototype,Qp(e,`icecandidate`,t=>(t.candidate&&Object.defineProperty(t,"candidate",{value:new e.RTCIceCandidate(t.candidate),writable:`false`}),t))}function qm(e){!e.RTCIceCandidate||e.RTCIceCandidate&&`relayProtocol`in e.RTCIceCandidate.prototype||Qp(e,`icecandidate`,e=>{if(e.candidate){let t=Gm.default.parseCandidate(e.candidate.candidate);t.type===`relay`&&(e.candidate.relayProtocol={0:`tls`,1:`tcp`,2:`udp`}[t.priority>>24])}return e})}function Jm(e,t){if(!e.RTCPeerConnection||t.browser===`chrome`&&t.version>102||t.browser===`firefox`&&t.version>=113)return;`sctp`in e.RTCPeerConnection.prototype||Object.defineProperty(e.RTCPeerConnection.prototype,"sctp",{get(){return this._sctp===void 0?null:this._sctp}});let n=function(e){if(!e||!e.sdp)return!1;let t=Gm.default.splitSections(e.sdp);return t.shift(),t.some(e=>{let t=Gm.default.parseMLine(e);return t&&t.kind===`application`&&t.protocol.indexOf(`SCTP`)!==-1})},r=function(e){let t=e.sdp.match(/mozilla...THIS_IS_SDPARTA-(\d+)/);if(t===null||t.length<2)return-1;let n=parseInt(t[1],10);return n===n?n:-1},i=function(e){let n=65536;return t.browser===`firefox`&&(n=t.version<57?e===-1?16384:2147483637:t.version<60?t.version===57?65535:65536:2147483637),n},a=function(e,n){let r=65536;t.browser===`firefox`&&t.version===57&&(r=65535);let i=Gm.default.matchPrefix(e.sdp,`a=max-message-size:`);return i.length>0?r=parseInt(i[0].substring(19),10):t.browser===`firefox`&&n!==-1&&(r=2147483637),r},o=e.RTCPeerConnection.prototype.setRemoteDescription;e.RTCPeerConnection.prototype.setRemoteDescription=function(){if(this._sctp=null,t.browser===`chrome`&&t.version>=76){let{sdpSemantics:e}=this.getConfiguration();e===`plan-b`&&Object.defineProperty(this,"sctp",{get(){return this._sctp===void 0?null:this._sctp},enumerable:!0,configurable:!0})}if(n(arguments[0])){let e=r(arguments[0]),t=i(e),n=a(arguments[0],e),o;o=t===0&&n===0?1/0:t===0||n===0?Math.max(t,n):Math.min(t,n);let s={};Object.defineProperty(s,"maxMessageSize",{get(){return o}}),this._sctp=s}return o.apply(this,arguments)}}function Ym(e,t){if(!(e.RTCPeerConnection&&`createDataChannel`in e.RTCPeerConnection.prototype)||t.browser===`chrome`&&t.version>=149||t.browser===`firefox`&&t.version>60)return;function n(e,t){let n=e.send;e.send=function(){let r=arguments[0],i=r.length||r.size||r.byteLength;if(e.readyState===`open`&&t.sctp&&i>t.sctp.maxMessageSize)throw TypeError(`Message too large (can send a maximum of `+t.sctp.maxMessageSize+` bytes)`);return n.apply(e,arguments)}}let r=e.RTCPeerConnection.prototype.createDataChannel;e.RTCPeerConnection.prototype.createDataChannel=function(){let e=r.apply(this,arguments);return n(e,this),e},Qp(e,`datachannel`,e=>(n(e.channel,e.target),e))}function Xm(e){if(!e.RTCPeerConnection||`connectionState`in e.RTCPeerConnection.prototype)return;let t=e.RTCPeerConnection.prototype;Object.defineProperty(t,"connectionState",{get(){return{completed:`connected`,checking:`connecting`}[this.iceConnectionState]||this.iceConnectionState},enumerable:!0,configurable:!0}),Object.defineProperty(t,"onconnectionstatechange",{get(){return this._onconnectionstatechange||null},set(e){this._onconnectionstatechange&&(this.removeEventListener(`connectionstatechange`,this._onconnectionstatechange),delete this._onconnectionstatechange),e&&this.addEventListener(`connectionstatechange`,this._onconnectionstatechange=e)},enumerable:!0,configurable:!0}),[`setLocalDescription`,`setRemoteDescription`].forEach(e=>{let n=t[e];t[e]=function(){return this._connectionstatechangepoly||(this._connectionstatechangepoly=e=>{let t=e.target;if(t._lastConnectionState!==t.connectionState){t._lastConnectionState=t.connectionState;let n=new Event(`connectionstatechange`,e);t.dispatchEvent(n)}return e},this.addEventListener(`iceconnectionstatechange`,this._connectionstatechangepoly)),n.apply(this,arguments)}})}function Zm(e,t){if(!e.RTCPeerConnection||t.browser===`chrome`&&t.version>=71||t.browser===`safari`&&t._safariVersion>=13.1)return;let n=e.RTCPeerConnection.prototype.setRemoteDescription;e.RTCPeerConnection.prototype.setRemoteDescription=function(t){if(t&&t.sdp&&t.sdp.indexOf(`
a=extmap-allow-mixed`)!==-1){let n=t.sdp.split(`
`).filter(e=>e.trim()!==`a=extmap-allow-mixed`).join(`
`);e.RTCSessionDescription&&t instanceof e.RTCSessionDescription?arguments[0]=new e.RTCSessionDescription({type:t.type,sdp:n}):t.sdp=n}return n.apply(this,arguments)}}function Qm(e,t){if(!(e.RTCPeerConnection&&e.RTCPeerConnection.prototype))return;let n=e.RTCPeerConnection.prototype.addIceCandidate;!n||n.length===0||(e.RTCPeerConnection.prototype.addIceCandidate=function(){return arguments[0]?(t.browser===`chrome`&&t.version<78||t.browser===`firefox`&&t.version<68||t.browser===`safari`)&&arguments[0]&&arguments[0].candidate===``?Promise.resolve():n.apply(this,arguments):(arguments[1]&&arguments[1].apply(null),Promise.resolve())})}function $m(e,t){if(!(e.RTCPeerConnection&&e.RTCPeerConnection.prototype))return;let n=e.RTCPeerConnection.prototype.setLocalDescription;!n||n.length===0||(e.RTCPeerConnection.prototype.setLocalDescription=function(){let e=arguments[0]||{};if(typeof e!=`object`||e.type&&e.sdp)return n.apply(this,arguments);if(e={type:e.type,sdp:e.sdp},!e.type)switch(this.signalingState){case`stable`:case`have-local-offer`:case`have-remote-pranswer`:e.type=`offer`;break;default:e.type=`answer`;break}return e.sdp||e.type!==`offer`&&e.type!==`answer`?n.apply(this,[e]):(e.type===`offer`?this.createOffer:this.createAnswer).apply(this).then(e=>n.apply(this,[e]))})}function eh({window:e}={},t={shimChrome:!0,shimFirefox:!0,shimSafari:!0}){let n=tm,r=rm(e),i={browserDetails:r,commonShim:Wm,extractVersion:Zp,disableLog:$p,disableWarnings:em,sdp:Gm};switch(r.browser){case`chrome`:if(!um||!_m||!t.shimChrome)return n(`Chrome shim is not included in this adapter release.`),i;if(r.version===null)return n(`Chrome shim can not determine version, not shimming.`),i;n(`adapter.js shimming chrome.`),i.browserShim=um,Qm(e,r),$m(e,r),lm(e,r),dm(e,r),_m(e,r),fm(e,r),gm(e,r),pm(e,r),mm(e,r),vm(e,r),Km(e,r),qm(e,r),Xm(e,r),Jm(e,r),Ym(e,r),Zm(e,r);break;case`firefox`:if(!xm||!Cm||!t.shimFirefox)return n(`Firefox shim is not included in this adapter release.`),i;n(`adapter.js shimming firefox.`),i.browserShim=xm,Qm(e,r),$m(e,r),ym(e,r),Cm(e,r),wm(e,r),Sm(e,r),Dm(e,r),Tm(e,r),Em(e,r),Om(e,r),km(e,r),Am(e,r),jm(e,r),Mm(e,r),Km(e,r),Xm(e,r),Jm(e,r),Ym(e,r);break;case`safari`:if(!Nm||!t.shimSafari)return n(`Safari shim is not included in this adapter release.`),i;n(`adapter.js shimming safari.`),i.browserShim=Nm,Qm(e,r),$m(e,r),zm(e,r),Vm(e,r),Im(e,r),Pm(e,r),Fm(e,r),Bm(e,r),Lm(e,r),Hm(e,r),Km(e,r),qm(e,r),Jm(e,r),Ym(e,r),Zm(e,r);break;default:n(`Unsupported browser!`);break}return i}var th=eh({window:typeof window>`u`?void 0:window});function nh(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}var rh=class{constructor(){this.chunkedMTU=16300,this._dataCount=1,this.chunk=e=>{let t=[],n=e.byteLength,r=Math.ceil(n/this.chunkedMTU),i=0,a=0;for(;a<n;){let o=Math.min(n,a+this.chunkedMTU),s=e.slice(a,o),c={__peerData:this._dataCount,n:i,data:s,total:r};t.push(c),a=o,i++}return this._dataCount++,t}}};function ih(e){let t=0;for(let n of e)t+=n.byteLength;let n=new Uint8Array(t),r=0;for(let t of e)n.set(t,r),r+=t.byteLength;return n}var ah=th.default||th,oh=new class{isWebRTCSupported(){return typeof RTCPeerConnection<`u`}isBrowserSupported(){let e=this.getBrowser(),t=this.getVersion();return this.supportedBrowsers.includes(e)?e===`chrome`?t>=this.minChromeVersion:e===`firefox`?t>=this.minFirefoxVersion:e===`safari`?!this.isIOS&&t>=this.minSafariVersion:!1:!1}getBrowser(){return ah.browserDetails.browser}getVersion(){return ah.browserDetails.version||0}isUnifiedPlanSupported(){let e=this.getBrowser(),t=ah.browserDetails.version||0;if(e===`chrome`&&t<this.minChromeVersion)return!1;if(e===`firefox`&&t>=this.minFirefoxVersion)return!0;if(!window.RTCRtpTransceiver||!(`currentDirection`in RTCRtpTransceiver.prototype))return!1;let n,r=!1;try{n=new RTCPeerConnection,n.addTransceiver(`audio`),r=!0}catch{}finally{n&&n.close()}return r}toString(){return`Supports:
    browser:${this.getBrowser()}
    version:${this.getVersion()}
    isIOS:${this.isIOS}
    isWebRTCSupported:${this.isWebRTCSupported()}
    isBrowserSupported:${this.isBrowserSupported()}
    isUnifiedPlanSupported:${this.isUnifiedPlanSupported()}`}constructor(){this.isIOS=typeof navigator<`u`?[`iPad`,`iPhone`,`iPod`].includes(navigator.platform):!1,this.supportedBrowsers=[`firefox`,`chrome`,`safari`],this.minFirefoxVersion=59,this.minChromeVersion=72,this.minSafariVersion=605}},sh=e=>!e||/^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.test(e),ch=()=>Math.random().toString(36).slice(2),lh={iceServers:[{urls:`stun:stun.l.google.com:19302`},{urls:[`turn:eu-0.turn.peerjs.com:3478`,`turn:us-0.turn.peerjs.com:3478`],username:`peerjs`,credential:`peerjsp`}],sdpSemantics:`unified-plan`},uh=new class extends rh{noop(){}blobToArrayBuffer(e,t){let n=new FileReader;return n.onload=function(e){e.target&&t(e.target.result)},n.readAsArrayBuffer(e),n}binaryStringToArrayBuffer(e){let t=new Uint8Array(e.length);for(let n=0;n<e.length;n++)t[n]=e.charCodeAt(n)&255;return t.buffer}isSecure(){return location.protocol===`https:`}constructor(...e){super(...e),this.CLOUD_HOST=`0.peerjs.com`,this.CLOUD_PORT=443,this.chunkedBrowsers={Chrome:1,chrome:1},this.defaultConfig=lh,this.browser=oh.getBrowser(),this.browserVersion=oh.getVersion(),this.pack=Kp,this.unpack=Gp,this.supports=function(){let e={browser:oh.isBrowserSupported(),webRTC:oh.isWebRTCSupported(),audioVideo:!1,data:!1,binaryBlob:!1,reliable:!1};if(!e.webRTC)return e;let t;try{t=new RTCPeerConnection(lh),e.audioVideo=!0;let n;try{n=t.createDataChannel(`_PEERJSTEST`,{ordered:!0}),e.data=!0,e.reliable=!!n.ordered;try{n.binaryType=`blob`,e.binaryBlob=!oh.isIOS}catch{}}catch{}finally{n&&n.close()}}catch{}finally{t&&t.close()}return e}(),this.validateId=sh,this.randomToken=ch}},dh=`PeerJS: `,X=new class{get logLevel(){return this._logLevel}set logLevel(e){this._logLevel=e}log(...e){this._logLevel>=3&&this._print(3,...e)}warn(...e){this._logLevel>=2&&this._print(2,...e)}error(...e){this._logLevel>=1&&this._print(1,...e)}setLogFunction(e){this._print=e}_print(e,...t){let n=[dh,...t];for(let e in n)n[e]instanceof Error&&(n[e]=`(`+n[e].name+`) `+n[e].message);e>=3?console.log(...n):e>=2?console.warn(`WARNING`,...n):e>=1&&console.error(`ERROR`,...n)}constructor(){this._logLevel=0}},fh={},ph=Object.prototype.hasOwnProperty,mh=`~`;function hh(){}Object.create&&(hh.prototype=Object.create(null),new hh().__proto__||(mh=!1));function gh(e,t,n){this.fn=e,this.context=t,this.once=n||!1}function _h(e,t,n,r,i){if(typeof n!=`function`)throw TypeError(`The listener must be a function`);var a=new gh(n,r||e,i),o=mh?mh+t:t;return e._events[o]?e._events[o].fn?e._events[o]=[e._events[o],a]:e._events[o].push(a):(e._events[o]=a,e._eventsCount++),e}function vh(e,t){--e._eventsCount===0?e._events=new hh:delete e._events[t]}function yh(){this._events=new hh,this._eventsCount=0}yh.prototype.eventNames=function(){var e=[],t,n;if(this._eventsCount===0)return e;for(n in t=this._events)ph.call(t,n)&&e.push(mh?n.slice(1):n);return Object.getOwnPropertySymbols?e.concat(Object.getOwnPropertySymbols(t)):e},yh.prototype.listeners=function(e){var t=mh?mh+e:e,n=this._events[t];if(!n)return[];if(n.fn)return[n.fn];for(var r=0,i=n.length,a=Array(i);r<i;r++)a[r]=n[r].fn;return a},yh.prototype.listenerCount=function(e){var t=mh?mh+e:e,n=this._events[t];return n?n.fn?1:n.length:0},yh.prototype.emit=function(e,t,n,r,i,a){var o=mh?mh+e:e;if(!this._events[o])return!1;var s=this._events[o],c=arguments.length,l,u;if(s.fn){switch(s.once&&this.removeListener(e,s.fn,void 0,!0),c){case 1:return s.fn.call(s.context),!0;case 2:return s.fn.call(s.context,t),!0;case 3:return s.fn.call(s.context,t,n),!0;case 4:return s.fn.call(s.context,t,n,r),!0;case 5:return s.fn.call(s.context,t,n,r,i),!0;case 6:return s.fn.call(s.context,t,n,r,i,a),!0}for(u=1,l=Array(c-1);u<c;u++)l[u-1]=arguments[u];s.fn.apply(s.context,l)}else{var d=s.length,f;for(u=0;u<d;u++)switch(s[u].once&&this.removeListener(e,s[u].fn,void 0,!0),c){case 1:s[u].fn.call(s[u].context);break;case 2:s[u].fn.call(s[u].context,t);break;case 3:s[u].fn.call(s[u].context,t,n);break;case 4:s[u].fn.call(s[u].context,t,n,r);break;default:if(!l)for(f=1,l=Array(c-1);f<c;f++)l[f-1]=arguments[f];s[u].fn.apply(s[u].context,l)}}return!0},yh.prototype.on=function(e,t,n){return _h(this,e,t,n,!1)},yh.prototype.once=function(e,t,n){return _h(this,e,t,n,!0)},yh.prototype.removeListener=function(e,t,n,r){var i=mh?mh+e:e;if(!this._events[i])return this;if(!t)return vh(this,i),this;var a=this._events[i];if(a.fn)a.fn===t&&(!r||a.once)&&(!n||a.context===n)&&vh(this,i);else{for(var o=0,s=[],c=a.length;o<c;o++)(a[o].fn!==t||r&&!a[o].once||n&&a[o].context!==n)&&s.push(a[o]);s.length?this._events[i]=s.length===1?s[0]:s:vh(this,i)}return this},yh.prototype.removeAllListeners=function(e){var t;return e?(t=mh?mh+e:e,this._events[t]&&vh(this,t)):(this._events=new hh,this._eventsCount=0),this},yh.prototype.off=yh.prototype.removeListener,yh.prototype.addListener=yh.prototype.on,yh.prefixed=mh,yh.EventEmitter=yh,fh=yh;var bh={};nh(bh,`ConnectionType`,()=>xh),nh(bh,`PeerErrorType`,()=>Sh),nh(bh,`BaseConnectionErrorType`,()=>Ch),nh(bh,`DataConnectionErrorType`,()=>wh),nh(bh,`SerializationType`,()=>Th),nh(bh,`SocketEventType`,()=>Eh),nh(bh,`ServerMessageType`,()=>Dh);var xh=function(e){return e.Data=`data`,e.Media=`media`,e}({}),Sh=function(e){return e.BrowserIncompatible=`browser-incompatible`,e.Disconnected=`disconnected`,e.InvalidID=`invalid-id`,e.InvalidKey=`invalid-key`,e.Network=`network`,e.PeerUnavailable=`peer-unavailable`,e.SslUnavailable=`ssl-unavailable`,e.ServerError=`server-error`,e.SocketError=`socket-error`,e.SocketClosed=`socket-closed`,e.UnavailableID=`unavailable-id`,e.WebRTC=`webrtc`,e}({}),Ch=function(e){return e.NegotiationFailed=`negotiation-failed`,e.ConnectionClosed=`connection-closed`,e}({}),wh=function(e){return e.NotOpenYet=`not-open-yet`,e.MessageToBig=`message-too-big`,e}({}),Th=function(e){return e.Binary=`binary`,e.BinaryUTF8=`binary-utf8`,e.JSON=`json`,e.None=`raw`,e}({}),Eh=function(e){return e.Message=`message`,e.Disconnected=`disconnected`,e.Error=`error`,e.Close=`close`,e}({}),Dh=function(e){return e.Heartbeat=`HEARTBEAT`,e.Candidate=`CANDIDATE`,e.Offer=`OFFER`,e.Answer=`ANSWER`,e.Open=`OPEN`,e.Error=`ERROR`,e.IdTaken=`ID-TAKEN`,e.InvalidKey=`INVALID-KEY`,e.Leave=`LEAVE`,e.Expire=`EXPIRE`,e}({}),Oh=`1.5.5`,kh=class extends fh.EventEmitter{constructor(e,t,n,r,i,a=5e3){super(),this.pingInterval=a,this._disconnected=!0,this._messagesQueue=[];let o=e?`wss://`:`ws://`;this._baseUrl=o+t+`:`+n+r+`peerjs?key=`+i}start(e,t){this._id=e;let n=`${this._baseUrl}&id=${e}&token=${t}`;this._socket||!this._disconnected||(this._socket=new WebSocket(n+`&version=1.5.5`),this._disconnected=!1,this._socket.onmessage=e=>{let t;try{t=JSON.parse(e.data),X.log(`Server message received:`,t)}catch{X.log(`Invalid server message`,e.data);return}this.emit(Eh.Message,t)},this._socket.onclose=e=>{this._disconnected||(X.log(`Socket closed.`,e),this._cleanup(),this._disconnected=!0,this.emit(Eh.Disconnected))},this._socket.onopen=()=>{this._disconnected||(this._sendQueuedMessages(),X.log(`Socket open`),this._scheduleHeartbeat())})}_scheduleHeartbeat(){this._wsPingTimer=setTimeout(()=>{this._sendHeartbeat()},this.pingInterval)}_sendHeartbeat(){if(!this._wsOpen()){X.log(`Cannot send heartbeat, because socket closed`);return}let e=JSON.stringify({type:Dh.Heartbeat});this._socket.send(e),this._scheduleHeartbeat()}_wsOpen(){return!!this._socket&&this._socket.readyState===1}_sendQueuedMessages(){let e=[...this._messagesQueue];this._messagesQueue=[];for(let t of e)this.send(t)}send(e){if(this._disconnected)return;if(!this._id){this._messagesQueue.push(e);return}if(!e.type){this.emit(Eh.Error,`Invalid message`);return}if(!this._wsOpen())return;let t=JSON.stringify(e);this._socket.send(t)}close(){this._disconnected||=(this._cleanup(),!0)}_cleanup(){this._socket&&=(this._socket.onopen=this._socket.onmessage=this._socket.onclose=null,this._socket.close(),void 0),clearTimeout(this._wsPingTimer)}},Ah=class{constructor(e){this.connection=e}startConnection(e){let t=this._startPeerConnection();if(this.connection.peerConnection=t,this.connection.type===xh.Media&&e._stream&&this._addTracksToConnection(e._stream,t),e.originator){let n=this.connection,r={ordered:!!e.reliable},i=t.createDataChannel(n.label,r);n._initializeDataChannel(i),this._makeOffer()}else this.handleSDP(`OFFER`,e.sdp)}_startPeerConnection(){X.log(`Creating RTCPeerConnection.`);let e=new RTCPeerConnection(this.connection.provider.options.config);return this._setupListeners(e),e}_setupListeners(e){let t=this.connection.peer,n=this.connection.connectionId,r=this.connection.type,i=this.connection.provider;X.log(`Listening for ICE candidates.`),e.onicecandidate=e=>{!e.candidate||!e.candidate.candidate||(X.log(`Received ICE candidates for ${t}:`,e.candidate),i.socket.send({type:Dh.Candidate,payload:{candidate:e.candidate,type:r,connectionId:n},dst:t}))},e.oniceconnectionstatechange=()=>{switch(e.iceConnectionState){case`failed`:X.log(`iceConnectionState is failed, closing connections to `+t),this.connection.emitError(Ch.NegotiationFailed,`Negotiation of connection to `+t+` failed.`),this.connection.close();break;case`closed`:X.log(`iceConnectionState is closed, closing connections to `+t),this.connection.emitError(Ch.ConnectionClosed,`Connection to `+t+` closed.`),this.connection.close();break;case`disconnected`:X.log(`iceConnectionState changed to disconnected on the connection with `+t);break;case`completed`:e.onicecandidate=()=>{};break}this.connection.emit(`iceStateChanged`,e.iceConnectionState)},X.log(`Listening for data channel`),e.ondatachannel=e=>{X.log(`Received data channel`);let r=e.channel;i.getConnection(t,n)._initializeDataChannel(r)},X.log(`Listening for remote stream`),e.ontrack=e=>{X.log(`Received remote stream`);let r=e.streams[0],a=i.getConnection(t,n);if(a.type===xh.Media){let e=a;this._addStreamToMediaConnection(r,e)}}}cleanup(){X.log(`Cleaning up PeerConnection to `+this.connection.peer);let e=this.connection.peerConnection;if(!e)return;this.connection.peerConnection=null,e.onicecandidate=e.oniceconnectionstatechange=e.ondatachannel=e.ontrack=()=>{};let t=e.signalingState!==`closed`,n=!1,r=this.connection.dataChannel;r&&(n=!!r.readyState&&r.readyState!==`closed`),(t||n)&&e.close()}async _makeOffer(){let e=this.connection.peerConnection,t=this.connection.provider;try{let n=await e.createOffer(this.connection.options.constraints);X.log(`Created offer.`),this.connection.options.sdpTransform&&typeof this.connection.options.sdpTransform==`function`&&(n.sdp=this.connection.options.sdpTransform(n.sdp)||n.sdp);try{await e.setLocalDescription(n),X.log(`Set localDescription:`,n,`for:${this.connection.peer}`);let r={sdp:n,type:this.connection.type,connectionId:this.connection.connectionId,metadata:this.connection.metadata};if(this.connection.type===xh.Data){let e=this.connection;r={...r,label:e.label,reliable:e.reliable,serialization:e.serialization}}t.socket.send({type:Dh.Offer,payload:r,dst:this.connection.peer})}catch(e){e!=`OperationError: Failed to set local offer sdp: Called in wrong state: kHaveRemoteOffer`&&(t.emitError(Sh.WebRTC,e),X.log(`Failed to setLocalDescription, `,e))}}catch(e){t.emitError(Sh.WebRTC,e),X.log(`Failed to createOffer, `,e)}}async _makeAnswer(){let e=this.connection.peerConnection,t=this.connection.provider;try{let n=await e.createAnswer();X.log(`Created answer.`),this.connection.options.sdpTransform&&typeof this.connection.options.sdpTransform==`function`&&(n.sdp=this.connection.options.sdpTransform(n.sdp)||n.sdp);try{await e.setLocalDescription(n),X.log(`Set localDescription:`,n,`for:${this.connection.peer}`),t.socket.send({type:Dh.Answer,payload:{sdp:n,type:this.connection.type,connectionId:this.connection.connectionId},dst:this.connection.peer})}catch(e){t.emitError(Sh.WebRTC,e),X.log(`Failed to setLocalDescription, `,e)}}catch(e){t.emitError(Sh.WebRTC,e),X.log(`Failed to create answer, `,e)}}async handleSDP(e,t){t=new RTCSessionDescription(t);let n=this.connection.peerConnection,r=this.connection.provider;X.log(`Setting remote description`,t);let i=this;try{await n.setRemoteDescription(t),X.log(`Set remoteDescription:${e} for:${this.connection.peer}`),e===`OFFER`&&await i._makeAnswer()}catch(e){r.emitError(Sh.WebRTC,e),X.log(`Failed to setRemoteDescription, `,e)}}async handleCandidate(e){X.log(`handleCandidate:`,e);try{await this.connection.peerConnection.addIceCandidate(e),X.log(`Added ICE candidate for:${this.connection.peer}`)}catch(e){this.connection.provider.emitError(Sh.WebRTC,e),X.log(`Failed to handleCandidate, `,e)}}_addTracksToConnection(e,t){if(X.log(`add tracks from stream ${e.id} to peer connection`),!t.addTrack)return X.error(`Your browser does't support RTCPeerConnection#addTrack. Ignored.`);e.getTracks().forEach(n=>{t.addTrack(n,e)})}_addStreamToMediaConnection(e,t){X.log(`add stream ${e.id} to media connection ${t.connectionId}`),t.addStream(e)}},jh=class extends fh.EventEmitter{emitError(e,t){X.error(`Error:`,t),this.emit(`error`,new Mh(`${e}`,t))}},Mh=class extends Error{constructor(e,t){typeof t==`string`?super(t):(super(),Object.assign(this,t)),this.type=e}},Nh=class extends jh{get open(){return this._open}constructor(e,t,n){super(),this.peer=e,this.provider=t,this.options=n,this._open=!1,this.metadata=n.metadata}},Ph=class e extends Nh{static#e=this.ID_PREFIX=`mc_`;get type(){return xh.Media}get localStream(){return this._localStream}get remoteStream(){return this._remoteStream}constructor(t,n,r){super(t,n,r),this._localStream=this.options._stream,this.connectionId=this.options.connectionId||e.ID_PREFIX+uh.randomToken(),this._negotiator=new Ah(this),this._localStream&&this._negotiator.startConnection({_stream:this._localStream,originator:!0})}_initializeDataChannel(e){this.dataChannel=e,this.dataChannel.onopen=()=>{X.log(`DC#${this.connectionId} dc connection success`),this.emit(`willCloseOnRemote`)},this.dataChannel.onclose=()=>{X.log(`DC#${this.connectionId} dc closed for:`,this.peer),this.close()}}addStream(e){X.log(`Receiving stream`,e),this._remoteStream=e,super.emit(`stream`,e)}handleMessage(e){let t=e.type,n=e.payload;switch(e.type){case Dh.Answer:this._negotiator.handleSDP(t,n.sdp),this._open=!0;break;case Dh.Candidate:this._negotiator.handleCandidate(n.candidate);break;default:X.warn(`Unrecognized message type:${t} from peer:${this.peer}`);break}}answer(e,t={}){if(this._localStream){X.warn(`Local stream already exists on this MediaConnection. Are you answering a call twice?`);return}this._localStream=e,t&&t.sdpTransform&&(this.options.sdpTransform=t.sdpTransform),this._negotiator.startConnection({...this.options._payload,_stream:e});let n=this.provider._getMessages(this.connectionId);for(let e of n)this.handleMessage(e);this._open=!0}close(){this._negotiator&&=(this._negotiator.cleanup(),null),this._localStream=null,this._remoteStream=null,this.provider&&=(this.provider._removeConnection(this),null),this.options&&this.options._stream&&(this.options._stream=null),this.open&&(this._open=!1,super.emit(`close`))}},Fh=class{constructor(e){this._options=e}_buildRequest(e){let t=this._options.secure?`https`:`http`,{host:n,port:r,path:i,key:a}=this._options,o=new URL(`${t}://${n}:${r}${i}${a}/${e}`);return o.searchParams.set(`ts`,`${Date.now()}${Math.random()}`),o.searchParams.set(`version`,Oh),fetch(o.href,{referrerPolicy:this._options.referrerPolicy})}async retrieveId(){try{let e=await this._buildRequest(`id`);if(e.status!==200)throw Error(`Error. Status:${e.status}`);return e.text()}catch(e){X.error(`Error retrieving ID`,e);let t=``;throw this._options.path===`/`&&this._options.host!==uh.CLOUD_HOST&&(t=" If you passed in a `path` to your self-hosted PeerServer, you'll also need to pass in that same path when creating a new Peer."),Error(`Could not get an ID from the server.`+t)}}async listAllPeers(){try{let e=await this._buildRequest(`peers`);if(e.status!==200){if(e.status===401){let e=``;throw e=this._options.host===uh.CLOUD_HOST?`It looks like you're using the cloud server. You can email team@peerjs.com to enable peer listing for your API key.`:"You need to enable `allow_discovery` on your self-hosted PeerServer to use this feature.",Error(`It doesn't look like you have permission to list peers IDs. `+e)}throw Error(`Error. Status:${e.status}`)}return e.json()}catch(e){throw X.error(`Error retrieving list peers`,e),Error(`Could not get list peers from the server.`+e)}}},Ih=class e extends Nh{static#e=this.ID_PREFIX=`dc_`;static#t=this.MAX_BUFFERED_AMOUNT=8388608;get type(){return xh.Data}constructor(t,n,r){super(t,n,r),this.connectionId=this.options.connectionId||e.ID_PREFIX+ch(),this.label=this.options.label||this.connectionId,this.reliable=!!this.options.reliable,this._negotiator=new Ah(this),this._negotiator.startConnection(this.options._payload||{originator:!0,reliable:this.reliable})}_initializeDataChannel(e){this.dataChannel=e,this.dataChannel.onopen=()=>{X.log(`DC#${this.connectionId} dc connection success`),this._open=!0,this.emit(`open`)},this.dataChannel.onmessage=e=>{X.log(`DC#${this.connectionId} dc onmessage:`,e.data)},this.dataChannel.onclose=()=>{X.log(`DC#${this.connectionId} dc closed for:`,this.peer),this.close()}}close(e){if(e?.flush){this.send({__peerData:{type:`close`}});return}this._negotiator&&=(this._negotiator.cleanup(),null),this.provider&&=(this.provider._removeConnection(this),null),this.dataChannel&&=(this.dataChannel.onopen=null,this.dataChannel.onmessage=null,this.dataChannel.onclose=null,null),this.open&&(this._open=!1,super.emit(`close`))}send(e,t=!1){if(!this.open){this.emitError(wh.NotOpenYet,"Connection is not open. You should listen for the `open` event before sending messages.");return}return this._send(e,t)}async handleMessage(e){let t=e.payload;switch(e.type){case Dh.Answer:await this._negotiator.handleSDP(e.type,t.sdp);break;case Dh.Candidate:await this._negotiator.handleCandidate(t.candidate);break;default:X.warn(`Unrecognized message type:`,e.type,`from peer:`,this.peer);break}}},Lh=class extends Ih{get bufferSize(){return this._bufferSize}_initializeDataChannel(e){super._initializeDataChannel(e),this.dataChannel.binaryType=`arraybuffer`,this.dataChannel.addEventListener(`message`,e=>this._handleDataMessage(e))}_bufferedSend(e){(this._buffering||!this._trySend(e))&&(this._buffer.push(e),this._bufferSize=this._buffer.length)}_trySend(e){if(!this.open)return!1;if(this.dataChannel.bufferedAmount>Ih.MAX_BUFFERED_AMOUNT)return this._buffering=!0,setTimeout(()=>{this._buffering=!1,this._tryBuffer()},50),!1;try{this.dataChannel.send(e)}catch(e){return X.error(`DC#:${this.connectionId} Error when sending:`,e),this._buffering=!0,this.close(),!1}return!0}_tryBuffer(){if(!this.open||this._buffer.length===0)return;let e=this._buffer[0];this._trySend(e)&&(this._buffer.shift(),this._bufferSize=this._buffer.length,this._tryBuffer())}close(e){if(e?.flush){this.send({__peerData:{type:`close`}});return}this._buffer=[],this._bufferSize=0,super.close()}constructor(...e){super(...e),this._buffer=[],this._bufferSize=0,this._buffering=!1}},Rh=class extends Lh{close(e){super.close(e),this._chunkedData={}}constructor(e,t,n){super(e,t,n),this.chunker=new rh,this.serialization=Th.Binary,this._chunkedData={}}_handleDataMessage({data:e}){let t=Gp(e),n=t.__peerData;if(n){if(n.type===`close`){this.close();return}this._handleChunk(t);return}this.emit(`data`,t)}_handleChunk(e){let t=e.__peerData,n=this._chunkedData[t]||{data:[],count:0,total:e.total};if(n.data[e.n]=new Uint8Array(e.data),n.count++,this._chunkedData[t]=n,n.total===n.count){delete this._chunkedData[t];let e=ih(n.data);this._handleDataMessage({data:e})}}_send(e,t){let n=Kp(e);if(n instanceof Promise)return this._send_blob(n);if(!t&&n.byteLength>this.chunker.chunkedMTU){this._sendChunks(n);return}this._bufferedSend(n)}async _send_blob(e){let t=await e;if(t.byteLength>this.chunker.chunkedMTU){this._sendChunks(t);return}this._bufferedSend(t)}_sendChunks(e){let t=this.chunker.chunk(e);X.log(`DC#${this.connectionId} Try to send ${t.length} chunks...`);for(let e of t)this.send(e,!0)}},zh=class extends Lh{_handleDataMessage({data:e}){super.emit(`data`,e)}_send(e,t){this._bufferedSend(e)}constructor(...e){super(...e),this.serialization=Th.None}},Bh=class extends Lh{_handleDataMessage({data:e}){let t=this.parse(this.decoder.decode(e)),n=t.__peerData;if(n&&n.type===`close`){this.close();return}this.emit(`data`,t)}_send(e,t){let n=this.encoder.encode(this.stringify(e));if(n.byteLength>=uh.chunkedMTU){this.emitError(wh.MessageToBig,`Message too big for JSON channel`);return}this._bufferedSend(n)}constructor(...e){super(...e),this.serialization=Th.JSON,this.encoder=new TextEncoder,this.decoder=new TextDecoder,this.stringify=JSON.stringify,this.parse=JSON.parse}},Vh=class e extends jh{static#e=this.DEFAULT_KEY=`peerjs`;get id(){return this._id}get options(){return this._options}get open(){return this._open}get socket(){return this._socket}get connections(){let e=Object.create(null);for(let[t,n]of this._connections)e[t]=n;return e}get destroyed(){return this._destroyed}get disconnected(){return this._disconnected}constructor(t,n){super(),this._serializers={raw:zh,json:Bh,binary:Rh,"binary-utf8":Rh,default:Rh},this._id=null,this._lastServerId=null,this._destroyed=!1,this._disconnected=!1,this._open=!1,this._connections=new Map,this._lostMessages=new Map;let r;if(t&&t.constructor==Object?n=t:t&&(r=t.toString()),n={debug:0,host:uh.CLOUD_HOST,port:uh.CLOUD_PORT,path:`/`,key:e.DEFAULT_KEY,token:uh.randomToken(),config:uh.defaultConfig,referrerPolicy:`strict-origin-when-cross-origin`,serializers:{},...n},this._options=n,this._serializers={...this._serializers,...this.options.serializers},this._options.host===`/`&&(this._options.host=window.location.hostname),this._options.path&&(this._options.path[0]!==`/`&&(this._options.path=`/`+this._options.path),this._options.path[this._options.path.length-1]!==`/`&&(this._options.path+=`/`)),this._options.secure===void 0&&this._options.host!==uh.CLOUD_HOST?this._options.secure=uh.isSecure():this._options.host==uh.CLOUD_HOST&&(this._options.secure=!0),this._options.logFunction&&X.setLogFunction(this._options.logFunction),X.logLevel=this._options.debug||0,this._api=new Fh(n),this._socket=this._createServerConnection(),!uh.supports.audioVideo&&!uh.supports.data){this._delayedAbort(Sh.BrowserIncompatible,`The current browser does not support WebRTC`);return}if(r&&!uh.validateId(r)){this._delayedAbort(Sh.InvalidID,`ID "${r}" is invalid`);return}r?this._initialize(r):this._api.retrieveId().then(e=>this._initialize(e)).catch(e=>this._abort(Sh.ServerError,e))}_createServerConnection(){let e=new kh(this._options.secure,this._options.host,this._options.port,this._options.path,this._options.key,this._options.pingInterval);return e.on(Eh.Message,e=>{this._handleMessage(e)}),e.on(Eh.Error,e=>{this._abort(Sh.SocketError,e)}),e.on(Eh.Disconnected,()=>{this.disconnected||(this.emitError(Sh.Network,`Lost connection to server.`),this.disconnect())}),e.on(Eh.Close,()=>{this.disconnected||this._abort(Sh.SocketClosed,`Underlying socket is already closed.`)}),e}_initialize(e){this._id=e,this.socket.start(e,this._options.token)}_handleMessage(e){let t=e.type,n=e.payload,r=e.src;switch(t){case Dh.Open:this._lastServerId=this.id,this._open=!0,this.emit(`open`,this.id);break;case Dh.Error:this._abort(Sh.ServerError,n.msg);break;case Dh.IdTaken:this._abort(Sh.UnavailableID,`ID "${this.id}" is taken`);break;case Dh.InvalidKey:this._abort(Sh.InvalidKey,`API KEY "${this._options.key}" is invalid`);break;case Dh.Leave:X.log(`Received leave message from ${r}`),this._cleanupPeer(r),this._connections.delete(r);break;case Dh.Expire:this.emitError(Sh.PeerUnavailable,`Could not connect to peer ${r}`);break;case Dh.Offer:{let e=n.connectionId,t=this.getConnection(r,e);if(t&&(t.close(),X.warn(`Offer received for existing Connection ID:${e}`)),n.type===xh.Media){let i=new Ph(r,this,{connectionId:e,_payload:n,metadata:n.metadata});t=i,this._addConnection(r,t),this.emit(`call`,i)}else if(n.type===xh.Data){let i=new this._serializers[n.serialization](r,this,{connectionId:e,_payload:n,metadata:n.metadata,label:n.label,serialization:n.serialization,reliable:n.reliable});t=i,this._addConnection(r,t),this.emit(`connection`,i)}else{X.warn(`Received malformed connection type:${n.type}`);return}let i=this._getMessages(e);for(let e of i)t.handleMessage(e);break}default:{if(!n){X.warn(`You received a malformed message from ${r} of type ${t}`);return}let i=n.connectionId,a=this.getConnection(r,i);a&&a.peerConnection?a.handleMessage(e):i?this._storeMessage(i,e):X.warn(`You received an unrecognized message:`,e);break}}}_storeMessage(e,t){this._lostMessages.has(e)||this._lostMessages.set(e,[]),this._lostMessages.get(e).push(t)}_getMessages(e){let t=this._lostMessages.get(e);return t?(this._lostMessages.delete(e),t):[]}connect(e,t={}){if(t={serialization:`default`,...t},this.disconnected){X.warn(`You cannot connect to a new Peer because you called .disconnect() on this Peer and ended your connection with the server. You can create a new Peer to reconnect, or call reconnect on this peer if you believe its ID to still be available.`),this.emitError(Sh.Disconnected,`Cannot connect to new Peer after disconnecting from server.`);return}let n=new this._serializers[t.serialization](e,this,t);return this._addConnection(e,n),n}call(e,t,n={}){if(this.disconnected){X.warn(`You cannot connect to a new Peer because you called .disconnect() on this Peer and ended your connection with the server. You can create a new Peer to reconnect.`),this.emitError(Sh.Disconnected,`Cannot connect to new Peer after disconnecting from server.`);return}if(!t){X.error("To call a peer, you must provide a stream from your browser's `getUserMedia`.");return}let r=new Ph(e,this,{...n,_stream:t});return this._addConnection(e,r),r}_addConnection(e,t){X.log(`add connection ${t.type}:${t.connectionId} to peerId:${e}`),this._connections.has(e)||this._connections.set(e,[]),this._connections.get(e).push(t)}_removeConnection(e){let t=this._connections.get(e.peer);if(t){let n=t.indexOf(e);n!==-1&&t.splice(n,1)}this._lostMessages.delete(e.connectionId)}getConnection(e,t){let n=this._connections.get(e);if(!n)return null;for(let e of n)if(e.connectionId===t)return e;return null}_delayedAbort(e,t){setTimeout(()=>{this._abort(e,t)},0)}_abort(e,t){X.error(`Aborting!`),this.emitError(e,t),this._lastServerId?this.disconnect():this.destroy()}destroy(){this.destroyed||(X.log(`Destroy peer with ID:${this.id}`),this.disconnect(),this._cleanup(),this._destroyed=!0,this.emit(`close`))}_cleanup(){for(let e of this._connections.keys())this._cleanupPeer(e),this._connections.delete(e);this.socket.removeAllListeners()}_cleanupPeer(e){let t=this._connections.get(e);if(t)for(let e of t)e.close()}disconnect(){if(this.disconnected)return;let e=this.id;X.log(`Disconnect peer with ID:${e}`),this._disconnected=!0,this._open=!1,this.socket.close(),this._lastServerId=e,this._id=null,this.emit(`disconnected`,e)}reconnect(){if(this.disconnected&&!this.destroyed)X.log(`Attempting reconnection to server with ID ${this._lastServerId}`),this._disconnected=!1,this._initialize(this._lastServerId);else if(this.destroyed)throw Error(`This peer cannot reconnect to the server. It has already been destroyed.`);else if(!this.disconnected&&!this.open)X.error(`In a hurry? We're still trying to make the initial connection!`);else throw Error(`Peer ${this.id} cannot reconnect because it is not disconnected from the server!`)}listAllPeers(e=e=>{}){this._api.listAllPeers().then(t=>e(t)).catch(e=>this._abort(Sh.ServerError,e))}},Hh=new Set([`carbine`,`smg`,`scattergun`]);function Uh(e){if(!e||typeof e!=`object`)return!1;let t=e;return typeof t.id==`string`&&t.id.length>0&&t.id.length<=80&&typeof t.name==`string`&&t.name.length>0&&t.name.length<=20&&(t.team===0||t.team===1)&&[`x`,`y`,`z`,`yaw`,`pitch`,`hp`,`kills`,`deaths`,`seq`].every(e=>Number.isFinite(t[e]))&&(t.stance===void 0||t.stance===`stand`||t.stance===`crouch`||t.stance===`prone`)&&Hh.has(t.weapon)}function Wh(e){if(!e||typeof e!=`object`)return!1;let t=e;switch(t.type){case`join`:case`state`:return Uh(t.player);case`shot`:return typeof t.by==`string`&&Hh.has(t.weapon)&&Array.isArray(t.origin)&&t.origin.length===3&&t.origin.every(Number.isFinite)&&Array.isArray(t.direction)&&t.direction.length===3&&t.direction.every(Number.isFinite)&&Number.isFinite(t.nonce);case`hit`:return typeof t.by==`string`&&typeof t.target==`string`&&Number.isFinite(t.damage)&&Number(t.damage)>0&&Number(t.damage)<=100&&Number.isFinite(t.nonce);case`death`:return typeof t.killer==`string`&&typeof t.victim==`string`&&Number.isFinite(t.nonce);case`leave`:return typeof t.playerId==`string`;case`chat`:return typeof t.by==`string`&&typeof t.text==`string`&&t.text.length<=160;default:return!1}}function Gh(e,t){if(!t)return!1;switch(e.type){case`join`:case`state`:return e.player.id===t;case`shot`:case`hit`:case`chat`:return e.by===t;case`death`:return e.victim===t;case`leave`:return e.playerId===t}}function Kh(e){return e.replace(/[^a-zA-Z0-9 _-]/g,``).trim().slice(0,16)||`Player${Math.floor(Math.random()*900+100)}`}var qh=class{role=`offline`;roomCode=``;peer=null;hostConnection=null;guests=new Set;onMessage;onStatus;onReady=null;constructor(e,t){this.onMessage=e,this.onStatus=t}host(e){this.close(),this.role=`host`,this.onReady=e,this.onStatus(`Opening a secure peer lobby…`);let t=new Vh;this.peer=t,t.on(`open`,t=>{this.roomCode=t,this.onStatus(`Lobby ready — share the room code`,`ok`),e()}),t.on(`connection`,e=>this.wireGuest(e)),t.on(`error`,e=>this.onStatus(this.describeError(e),`error`)),t.on(`disconnected`,()=>this.onStatus(`Signalling disconnected; existing peers may continue`,`warn`))}join(e,t){if(this.close(),this.role=`client`,this.roomCode=e.trim(),this.onReady=t,!this.roomCode){this.onStatus(`Enter a room code first`,`error`);return}this.onStatus(`Connecting to peer lobby…`);let n=new Vh;this.peer=n,n.on(`open`,()=>{let e=n.connect(this.roomCode,{reliable:!0,serialization:`json`});this.hostConnection=e,this.wireHost(e)}),n.on(`error`,e=>this.onStatus(this.describeError(e),`error`)),n.on(`disconnected`,()=>this.onStatus(`Signalling disconnected; attempting to preserve session`,`warn`))}send(e){Wh(e)&&(this.role===`host`?this.broadcast(e):this.role===`client`&&this.hostConnection?.open&&this.hostConnection.send(e))}close(){if(this.hostConnection)try{this.hostConnection.close()}catch{}for(let e of this.guests)try{e.close()}catch{}if(this.guests.clear(),this.hostConnection=null,this.peer)try{this.peer.destroy()}catch{}this.peer=null,this.roomCode=``,this.role=`offline`,this.onReady=null}wireGuest(e){this.guests.add(e);let t=``;e.on(`open`,()=>this.onStatus(`${this.guests.size} guest connection${this.guests.size===1?``:`s`}`,`ok`)),e.on(`data`,n=>{if(Wh(n)){if(!t){if(n.type!==`join`)return;t=n.player.id}Gh(n,t)&&(this.onMessage(n),this.broadcast(n,e))}}),e.on(`close`,()=>{if(this.guests.delete(e),t){let e={type:`leave`,playerId:t};this.onMessage(e),this.broadcast(e)}this.onStatus(`A guest left the lobby`,`warn`)}),e.on(`error`,()=>this.onStatus(`Guest data channel failed`,`error`))}wireHost(e){e.on(`open`,()=>{this.onStatus(`Connected to host`,`ok`),this.onReady?.()}),e.on(`data`,e=>{Wh(e)&&this.onMessage(e)}),e.on(`close`,()=>this.onStatus(`Host connection closed`,`error`)),e.on(`error`,()=>this.onStatus(`Could not establish peer data channel`,`error`))}broadcast(e,t){for(let n of this.guests)n!==t&&n.open&&n.send(e)}describeError(e){let t=e instanceof Error?e.message:String(e);return/peer-unavailable/i.test(t)?`Room not found. Check the code and try again.`:/network|server/i.test(t)?`Peer signalling is unavailable. Check the connection and retry.`:`Network error: ${t.slice(0,120)}`}};function Jh(e){return!Number.isFinite(e)||e<=0?0:1-Math.exp(-24*Math.min(e,.05))}function Yh(){return{lastAcceptedAt:-1e4,recentNonces:[]}}function Xh(e,t,n,r){let i=e=>({accepted:!1,reason:e,nextState:r});if(!t||t.id!==e.by)return i(`unknown-sender`);if(t.weapon!==e.weapon)return i(`weapon-mismatch`);if(r.recentNonces.includes(e.nonce))return i(`duplicate`);let a=Math.hypot(...e.direction);if(!Number.isFinite(a)||a<.96||a>1.04)return i(`invalid-direction`);let o=Math.hypot(e.origin[0]-t.x,e.origin[1]-t.y,e.origin[2]-t.z);if(!Number.isFinite(o)||o>2.25)return i(`origin-mismatch`);let s=6e4/Gf[e.weapon].rpm;return n-r.lastAcceptedAt<s*.45?i(`cadence`):{accepted:!0,reason:`accepted`,nextState:{lastAcceptedAt:n,recentNonces:[...r.recentNonces.slice(-15),e.nonce]}}}var Zh=`modulepreload`,Qh=function(e,t){return new URL(e,t).href},$h={},eg=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function s(e){return import.meta.resolve?import.meta.resolve(e):new URL(e,new URL(`../../../src/node/plugins/importAnalysisBuild.ts`,import.meta.url)).href}r=o(t.map(t=>{if(t=Qh(t,n),t=s(t),t in $h)return;$h[t]=!0;let r=t.endsWith(`.css`);for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}let i=document.createElement(`link`);if(i.rel=r?`stylesheet`:Zh,r||(i.as=`script`),i.crossOrigin=``,i.href=t,a&&i.setAttribute(`nonce`,a),document.head.appendChild(i),r)return new Promise((e,n)=>{i.addEventListener(`load`,e),i.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},tg=.38,ng=.53,rg={stand:{halfHeight:ng,radius:tg,eyeFromCenter:.79},crouch:{halfHeight:.22,radius:.36,eyeFromCenter:.58},prone:{halfHeight:.04,radius:.31,eyeFromCenter:.15}},ig=class e{makeCapsule;world;body;collider;controller;stance=`stand`;constructor(e,t,n,r){this.makeCapsule=r,this.world=e,this.body=t,this.collider=n,this.controller=e.createCharacterController(.025),this.controller.setSlideEnabled(!0),this.controller.enableAutostep(.42,.22,!1),this.controller.enableSnapToGround(.24),this.controller.setMaxSlopeClimbAngle(50*Math.PI/180),this.controller.setMinSlopeSlideAngle(55*Math.PI/180)}static async create(t,n){let{default:r}=await eg(async()=>{let{default:e}=await import(`./rapier-B45baom8.js`);return{default:e}},[],import.meta.url),i=console.warn;console.warn=(...e)=>{e.length===1&&e[0]===`using deprecated parameters for the initialization function; pass a single object instead`||i(...e)};try{await r.init()}finally{console.warn=i}let a=new r.World({x:0,y:-22,z:0});a.timestep=1/120,a.createCollider(r.ColliderDesc.cuboid((n.maxX-n.minX)/2,.1,(n.maxZ-n.minZ)/2).setTranslation((n.minX+n.maxX)/2,-.1,(n.minZ+n.maxZ)/2));for(let e of t){let t=e.minY??0,n=e.maxY??8,i=Math.max(.01,(e.maxX-e.minX)/2),o=Math.max(.01,(n-t)/2),s=Math.max(.01,(e.maxZ-e.minZ)/2);a.createCollider(r.ColliderDesc.cuboid(i,o,s).setTranslation((e.minX+e.maxX)/2,(t+n)/2,(e.minZ+e.maxZ)/2))}let o=a.createRigidBody(r.RigidBodyDesc.kinematicPositionBased()),s=a.createCollider(r.ColliderDesc.capsule(ng,tg).setFriction(0).setActiveCollisionTypes(r.ActiveCollisionTypes.ALL),o),c=new e(a,o,s,(e,t)=>new r.Capsule(e,t));return c.teleportEye({x:0,y:1.7,z:0}),c}teleportEye(e){let t=rg[this.stance].eyeFromCenter;this.body.setTranslation({x:e.x,y:e.y-t,z:e.z},!0),this.world.propagateModifiedBodyPositionsToColliders()}eyePosition(){let e=this.body.translation();return{x:e.x,y:e.y+rg[this.stance].eyeFromCenter,z:e.z}}setStance(e){if(e===this.stance)return!0;let t=rg[this.stance],n=rg[e],r=this.body.translation(),i=t.halfHeight+t.radius,a=n.halfHeight+n.radius,o=r.y-i,s={x:r.x,y:o+a,z:r.z},c=this.makeCapsule(n.halfHeight,n.radius);if(a>i){let e=!1;if(this.world.intersectionsWithShape(s,{x:0,y:0,z:0,w:1},c,()=>(e=!0,!1),void 0,void 0,this.collider),e)return!1}return this.collider.setShape(c),this.body.setTranslation(s,!0),this.world.propagateModifiedBodyPositionsToColliders(),this.stance=e,e===`prone`?this.controller.disableAutostep():this.controller.enableAutostep(.42,.22,!1),!0}currentStance(){return this.stance}move(e,t){this.world.timestep=t,this.controller.computeColliderMovement(this.collider,e);let n=this.controller.computedMovement(),r=this.body.translation();this.body.setNextKinematicTranslation({x:r.x+n.x,y:r.y+n.y,z:r.z+n.z}),this.world.step();let i=this.eyePosition(),a=5e-4;return{position:i,grounded:this.controller.computedGrounded(),blockedX:Math.abs(n.x-e.x)>a,blockedY:Math.abs(n.y-e.y)>a,blockedZ:Math.abs(n.z-e.z)>a,appliedDelta:{x:n.x,y:n.y,z:n.z}}}dispose(){this.world.free()}},ag=class{lines;positions=new Float32Array(108);colors=new Float32Array(108);life=new Float32Array(18);cursor=0;constructor(e){let t=new Vr;t.setAttribute(`position`,new Er(this.positions,3)),t.setAttribute(`color`,new Er(this.colors,3));let n=new Yi({vertexColors:!0,transparent:!0,opacity:.72,depthWrite:!1,blending:2});this.lines=new sa(t,n),this.lines.name=`pooled-combat-tracers`,this.lines.frustumCulled=!1,this.lines.visible=!1,e.add(this.lines)}emit(e,t,n,r=.055){if(![e.x,e.y,e.z,t.x,t.y,t.z,r].every(Number.isFinite))return;let i=this.cursor++%18,a=i*6;this.positions.set([e.x,e.y,e.z,t.x,t.y,t.z],a);let o=new H(n);this.colors.set([o.r,o.g,o.b,o.r,o.g,o.b],a),this.life[i]=Bt.clamp(r,.016,.12),this.lines.visible=!0,this.markDirty()}update(e){let t=!1;for(let n=0;n<18;n+=1)this.life[n]<=0||(this.life[n]-=Math.max(0,e),this.life[n]<=0&&(this.positions.fill(0,n*6,n*6+6),t=!0));t&&this.markDirty(),this.lines.visible=this.activeCount()>0}activeCount(){return this.life.reduce((e,t)=>e+Number(t>0),0)}markDirty(){this.lines.geometry.getAttribute(`position`).needsUpdate=!0,this.lines.geometry.getAttribute(`color`).needsUpdate=!0}};function og(e,t,n,r,i){let a=t.clone().sub(e),o=a.length(),s=o>1e-6?a.multiplyScalar(1/o):new z(0,0,-1),c=Math.abs(n-r)+1e-4,l=n+r-1e-4,u=Bt.clamp(o,c,l),d=(n*n-r*r+u*u)/(2*u),f=Math.sqrt(Math.max(0,n*n-d*d)),p=i.clone().sub(s.clone().multiplyScalar(i.dot(s)));return p.lengthSq()<1e-6&&p.crossVectors(s,Math.abs(s.y)<.9?new z(0,1,0):new z(1,0,0)),p.normalize(),e.clone().addScaledVector(s,d).addScaledVector(p,f)}var sg=[{at:.12,event:`mag-release`},{at:.28,event:`mag-out`},{at:.66,event:`mag-in`},{at:.8,event:`mag-seat`},{at:.9,event:`bolt-release`}],cg=[{at:.2,event:`shell-insert`},{at:.39,event:`shell-insert`},{at:.58,event:`shell-insert`},{at:.77,event:`shell-insert`},{at:.91,event:`bolt-release`}],lg=e=>Math.min(1,Math.max(0,e)),ug=(e,t,n)=>{let r=lg((n-e)/Math.max(1e-4,t-e));return r*r*(3-2*r)};function dg(e,t,n){let r=lg(t),i=lg(n);return i<=r?[]:(e===`scattergun`?cg:sg).filter(({at:e})=>e>r&&e<=i).map(({event:e})=>e)}function fg(e,t){let n=lg(t);if(e===`scattergun`){let e=n*5%1,t=n>=.1&&n<=.82;return{magazineDrop:0,magazineTwist:0,magazineForward:0,magazineLateral:0,handToReload:ug(.05,.16,n)*(1-ug(.82,.94,n)),shellVisible:t&&e>.12&&e<.78,shellTravel:t?ug(.15,.72,e):0,actionPull:ug(.86,.91,n)*(1-ug(.91,.98,n))}}let r=ug(.1,.34,n),i=ug(.56,.81,n),a=r*(1-i);return{magazineDrop:a*.52+i*(1-ug(.78,.84,n))*.04,magazineTwist:a*.24,magazineForward:a*(e===`carbine`?.17:.1),magazineLateral:a*(e===`carbine`?-.075:-.045),handToReload:ug(.06,.2,n)*(1-ug(.82,.94,n)),shellVisible:!1,shellTravel:0,actionPull:ug(.84,.9,n)*(1-ug(.9,.98,n))}}var pg={carbine:{sightHeight:.215,adsX:-.36,adsY:.251,adsZ:-.04,projectionCorrection:0,flashScale:1,recoilTranslation:.13,recoilRotation:.18,actionTravel:.075,smokeBase:1,requiredDetails:[`optic-lens`,`optic-reticle`,`stock-cheek-rest`,`charging-handle`,`magazine-rib`]},smg:{sightHeight:.24,adsX:-.36,adsY:.135,adsZ:-.025,projectionCorrection:.101,flashScale:.78,recoilTranslation:.095,recoilRotation:.135,actionTravel:.09,smokeBase:1,requiredDetails:[`smg-aperture`,`smg-front-post`,`magazine-witness`,`muzzle-brake`,`charging-tab`]},scattergun:{sightHeight:.2,adsX:-.36,adsY:.159,adsZ:.015,projectionCorrection:.101,flashScale:1.45,recoilTranslation:.19,recoilRotation:.24,actionTravel:.22,smokeBase:3,requiredDetails:[`ghost-ring`,`front-bead`,`loading-port`,`shell-saddle`,`pump-rib`]}};function mg(e){return pg[e]}var hg=class{camera;flattenMaterials;root=new Rn;models=new Map;active=`carbine`;recoil=0;reloadStart=0;reloadDuration=0;reloadLastProgress=0;switchBlend=1;swayX=0;swayY=0;meleeStart=0;grenadeStart=0;muzzleLight;muzzleFlash;casings=[];smokes=[];smokePositions=new Float32Array(24);smokeColors=new Float32Array(24);smokePoints;armRigs=[];brassGeometry=new Ca(.018,.018,.085,7);shellGeometry=new Ca(.025,.025,.105,8);brassMaterial=new W({color:13149788,roughness:.3,metalness:.78});shellMaterial=new W({color:11812658,roughness:.58,metalness:.18});shotStarted=-1e4;casingCursor=0;smokeCursor=0;pendingScattergunShell=!1;pendingCasing=!1;adsBlend=0;sprintBlend=0;weaponHeat=0;shotsPresented=0;constructor(e,t=!1){this.camera=e,this.flattenMaterials=t,this.root.name=`original-weapon-view`,this.root.position.set(.36,-.38,-.78),this.root.scale.setScalar(.6),e.add(this.root);let n=new W({color:3232847,roughness:.84}),r=new W({color:12162623,roughness:.62,metalness:.12}),i=new W({color:2436398,roughness:.88}),a=new Rn;a.name=`first-person-arms`;let o=e=>{let a=e===`left`?-1:1,o=.56,s=.58,c=new Rn;c.name=`${e}-shoulder-joint`,c.position.set(a*.25,e===`right`?-.17:-.12,e===`right`?.52:.45);let l=new U(new xa(.095,o-.19,5,9),n);l.name=`${e}-upper-arm`,l.rotation.x=-Math.PI/2,l.position.z=-.56/2,l.castShadow=!0,c.add(l);let u=new Rn;u.name=`${e}-elbow-joint`,u.position.z=-.56,c.add(u);let d=new U(new xa(.09,s-.18,5,9),n);d.name=`${e}-forearm`,d.rotation.x=-Math.PI/2,d.position.z=-.58/2,d.castShadow=!0,u.add(d);let f=q(`${e}-glove-cuff`,[.205,.195,.14],r,.045,2);f.position.z=-.505,u.add(f);let p=q(`${e}-glove`,[.18,.155,.235],i,.055,3);p.position.set(a*-.015,-.01,-.635),p.rotation.x=-.12,u.add(p);let m=q(`${e}-thumb`,[.075,.1,.17],i,.028,2);m.position.set(a*-.105,-.04,-.615),m.rotation.z=a*.32,u.add(m);let h=t?1:3;for(let t=0;t<h;t+=1){let n=q(`${e}-finger-${t}`,[.036,.025,.14],i,.01,1);n.position.set(a*(.052-t*.052),-.09,-.6799999999999999),n.rotation.x=-.18,u.add(n)}let g=q(`${e}-sleeve-band`,[.202,.202,.055],r,.016,2);return g.position.z=-.56*.72,c.add(g),this.armRigs.push({side:e,shoulder:c,elbow:u,upperLength:o,lowerLength:s}),c};a.add(o(`right`),o(`left`)),a.scale.setScalar(.74),a.position.set(0,-.08,.02),this.root.add(a),this.muzzleLight=new Hs(16761706,0,4.5,2),this.muzzleLight.position.set(0,.08,-1.15),t||this.root.add(this.muzzleLight),this.muzzleFlash=new Rn,this.muzzleFlash.position.set(0,.08,-1.15);let s=new _i({color:16765834,transparent:!0,opacity:.92,depthWrite:!1,blending:2,side:2}),c=new U(new wa(.06,.46,7),s);c.name=`muzzle-flash-core`,c.rotation.x=-Math.PI/2,c.position.z=-.22;let l=new U(new wa(.14,.24,6),s.clone());l.name=`muzzle-flash-crown`,l.rotation.x=-Math.PI/2,l.position.z=-.1;let u=new U(new Ho(.38,.38),s.clone());u.name=`muzzle-flash-flare`,u.rotation.z=Math.PI/4,this.muzzleFlash.add(c,l,u),this.muzzleFlash.visible=!1,this.root.add(this.muzzleFlash);let d=new Vr;this.smokePositions.fill(0);for(let e=0;e<8;e+=1)this.smokePositions[e*3+1]=-1e4;d.setAttribute(`position`,new Er(this.smokePositions,3)),d.setAttribute(`color`,new Er(this.smokeColors,3)),this.smokePoints=new pa(d,new ca({size:t?.045:.075,vertexColors:!0,transparent:!0,opacity:.58,depthWrite:!1,sizeAttenuation:!0})),this.smokePoints.name=`pooled-muzzle-smoke`,this.smokePoints.visible=!1,this.smokePoints.frustumCulled=!1,this.root.add(this.smokePoints);for(let e=0;e<8;e+=1)this.smokes.push({velocity:new z,life:0,maxLife:0,active:!1});for(let e=0;e<16;e+=1){let t=new U(this.brassGeometry,this.brassMaterial);t.name=`pooled-casing-${e}`,t.visible=!1,t.rotation.z=Math.PI/2,this.root.add(t),this.casings.push({mesh:t,velocity:new z,life:0,active:!1})}}async load(e){let t=[`carbine`,`smg`,`scattergun`];t.forEach((n,r)=>{let i=Xd(n,this.flattenMaterials);if(n===`carbine`){i.traverse(e=>{(e.name===`stock-shoulder-pad`||e.name===`stock-cheek-rest`||e.name===`stock-support-rod`)&&(e.visible=!1)});let e=i.getObjectByName(`optic-reticle`);e instanceof U&&e.material instanceof _i&&(e.material=e.material.clone(),e.material.depthTest=!1,e.material.depthWrite=!1,e.renderOrder=1e3)}i.visible=!1,this.models.set(n,i),this.root.add(i),e?.(r+1,t.length)}),this.setWeapon(this.active,!0)}isReady(){return this.models.size===3}setWeapon(e,t=!1){this.active=e,this.switchBlend=+!!t,this.reloadDuration=0,this.reloadLastProgress=0,this.pendingScattergunShell=!1,this.pendingCasing=!1;for(let[t,n]of this.models)n.visible=t===e;let n=this.models.get(e)?.getObjectByName(`muzzle-socket`);n&&(this.muzzleLight.position.copy(n.position),this.muzzleFlash.position.copy(n.position))}ejectCasing(e){let t=this.casings[this.casingCursor++%this.casings.length];t.mesh.geometry=e?this.shellGeometry:this.brassGeometry,t.mesh.material=e?this.shellMaterial:this.brassMaterial;let n=this.models.get(this.active)?.getObjectByName(`eject-socket`);t.mesh.position.copy(n?.position??new z(.12,.04,-.48)),t.mesh.rotation.set(Math.random()*.4,0,Math.PI/2),t.mesh.visible=!0,t.velocity.set(e?.72:.95+Math.random()*.25,e?.55:.75+Math.random()*.2,e?.16:.1),t.life=e?.62:.42,t.active=!0}fire(e){let t=mg(this.active);this.weaponHeat=Rd(this.weaponHeat,!0,0,this.active),this.shotsPresented+=1,this.recoil=Math.min(1,this.recoil+.24+e*5.2),this.shotStarted=performance.now(),this.muzzleLight.intensity=this.flattenMaterials?0:this.active===`scattergun`?7.2:4.8,this.muzzleFlash.visible=!0,this.muzzleFlash.scale.setScalar(t.flashScale),this.muzzleFlash.rotation.z=Math.random()*Math.PI;let n=this.models.get(this.active)?.getObjectByName(`muzzle-socket`),r=Math.min(this.smokes.length,t.smokeBase+ +(this.weaponHeat>.56)),i=zd(this.active,0,this.weaponHeat);for(let e=0;e<r;e+=1){let t=this.smokeCursor++%this.smokes.length,r=this.smokes[t],a=t*3,o=n?.position??new z(0,.08,-1.15);this.smokePositions[a]=o.x+(Math.random()-.5)*.025,this.smokePositions[a+1]=o.y+(Math.random()-.5)*.02,this.smokePositions[a+2]=o.z-.05-e*.035,r.velocity.set((Math.random()-.5)*.055*i.smokeScale,(.1+Math.random()*.06)*i.smokeScale,(-.11-Math.random()*.08)*i.smokeScale),r.maxLife=this.active===`scattergun`?.38:.2+this.weaponHeat*.12,r.life=r.maxLife,r.active=!0,this.smokeColors[a]=this.smokeColors[a+1]=this.smokeColors[a+2]=.62}this.smokePoints.visible=!0,this.smokePoints.geometry.getAttribute(`position`).needsUpdate=!0,this.smokePoints.geometry.getAttribute(`color`).needsUpdate=!0,this.active===`scattergun`?this.pendingScattergunShell=!0:this.pendingCasing=!0}reload(e){this.reloadStart=performance.now(),this.reloadDuration=e*1e3,this.reloadLastProgress=0}cancelReload(){this.reloadDuration=0,this.reloadLastProgress=0}melee(){this.meleeStart=performance.now()}throwGrenade(){this.grenadeStart=performance.now()}addMouseDelta(e,t){this.swayX=Bt.clamp(this.swayX+e*8e-5,-.025,.025),this.swayY=Bt.clamp(this.swayY+t*6e-5,-.02,.02)}muzzleWorldPosition(e=new z){let t=this.models.get(this.active)?.getObjectByName(`muzzle-socket`);return t?t.getWorldPosition(e):null}adsProgress(){return this.adsBlend}presentationState(){let e=this.models.get(this.active),t=mg(this.active).requiredDetails,n=this.active===`carbine`?`optic-reticle`:this.active===`smg`?`smg-aperture`:`ghost-ring`,r=e?.getObjectByName(n);this.camera.updateMatrixWorld(!0),r?.updateWorldMatrix(!0,!1);let i=r?.getWorldPosition(new z).project(this.camera);return{weapon:this.active,heat:this.weaponHeat,shotsPresented:this.shotsPresented,activeCasings:this.casings.filter(e=>e.active).length,activeSmoke:this.smokes.reduce((e,t)=>e+Number(t.active),0),detailsReady:t.every(t=>e?.getObjectByName(t)!==void 0),adsProgress:this.adsBlend,sightOffset:i?[i.x,i.y]:null}}solveArms(e,t,n){if(t){this.root.updateMatrixWorld(!0);for(let r of this.armRigs){let i=r.side===`right`?`grip-socket-r`:`support-socket-l`,a=t.getObjectByName(i);if(!a)continue;let o=a.getWorldPosition(new z);if(r.side===`left`&&n.handToReload>0){let e=t.getObjectByName(`reload-socket-l`);e&&o.lerp(e.getWorldPosition(new z),n.handToReload)}let s=e.worldToLocal(o.clone()),c=new z(r.side===`left`?-.48:.48,-1,.22),l=og(r.shoulder.position,s,r.upperLength,r.lowerLength,c).sub(r.shoulder.position).normalize();r.shoulder.quaternion.setFromUnitVectors(new z(0,0,-1),l),r.elbow.position.set(0,0,-r.upperLength),r.shoulder.updateWorldMatrix(!0,!0);let u=r.shoulder.worldToLocal(o.clone()).sub(r.elbow.position).normalize();r.elbow.quaternion.setFromUnitVectors(new z(0,0,-1),u)}}}update(e){let t=[],n=t=>1-Math.exp(-t*e.dt);this.weaponHeat=Rd(this.weaponHeat,!1,e.dt,this.active),this.recoil=Bt.lerp(this.recoil,0,n(16)),this.muzzleLight.intensity=Bt.lerp(this.muzzleLight.intensity,0,n(30)),this.switchBlend=Bt.lerp(this.switchBlend,1,n(10)),this.swayX=Bt.lerp(this.swayX,0,n(7)),this.swayY=Bt.lerp(this.swayY,0,n(7)),this.adsBlend=Bt.lerp(this.adsBlend,+!!e.ads,n(e.ads?18:15)),this.sprintBlend=Bt.lerp(this.sprintBlend,+!!e.sprinting,n(13)),this.muzzleFlash.visible=this.muzzleLight.intensity>.45;let r=this.root.getObjectByName(`first-person-arms`);r&&(r.position.y=Bt.lerp(-.08,-.3,this.adsBlend));for(let t of this.casings)t.active&&(t.life-=e.dt,t.velocity.y-=4.5*e.dt,t.mesh.position.addScaledVector(t.velocity,e.dt),t.mesh.rotation.x+=e.dt*18,t.mesh.rotation.z+=e.dt*11,t.life<=0&&(t.active=!1,t.mesh.visible=!1));let i=0;for(let t=0;t<this.smokes.length;t+=1){let n=this.smokes[t];if(!n.active)continue;let r=t*3;if(n.life-=e.dt,n.life<=0){n.active=!1,this.smokePositions[r+1]=-1e4,this.smokeColors[r]=this.smokeColors[r+1]=this.smokeColors[r+2]=0;continue}i+=1,this.smokePositions[r]+=n.velocity.x*e.dt,this.smokePositions[r+1]+=n.velocity.y*e.dt,this.smokePositions[r+2]+=n.velocity.z*e.dt;let a=Math.min(1,n.life/Math.max(.001,n.maxLife)*1.7)*.62;this.smokeColors[r]=this.smokeColors[r+1]=this.smokeColors[r+2]=a}this.smokePoints.visible=i>0,i>0&&(this.smokePoints.geometry.getAttribute(`position`).needsUpdate=!0,this.smokePoints.geometry.getAttribute(`color`).needsUpdate=!0);let a=this.models.get(this.active),o=mg(this.active),s=performance.now()-this.shotStarted,c=zd(this.active,s,this.weaponHeat);this.muzzleFlash.visible=c.flash>.015,this.muzzleFlash.visible&&this.muzzleFlash.scale.setScalar(o.flashScale*(.72+c.flash*.38)),this.active===`scattergun`&&this.pendingScattergunShell&&c.casingReady?(this.ejectCasing(!0),this.pendingScattergunShell=!1):this.active!==`scattergun`&&this.pendingCasing&&c.casingReady&&(this.ejectCasing(!1),this.pendingCasing=!1);let l=a?.getObjectByName(`bolt-or-slide`);if(l){let e=Number(l.userData.restZ??0);l.position.z=e+c.boltTravel*o.actionTravel}let u=a?.getObjectByName(`pump`);if(u){let e=Number(u.userData.restZ??-.48);u.position.z=e+c.boltTravel*o.actionTravel}let d=e.moving?e.sprinting?1.22:e.ads||e.prone?.12:e.crouched?.32:.56:.05,f=Math.cos(e.phase*.5)*.017*d,p=Math.sin(e.phase)*.019*d,m=Math.sin(performance.now()*.0017)*(e.ads?.0015:.0045),h=this.adsBlend*o.adsX,g=this.adsBlend*o.adsY,_=this.adsBlend*o.adsZ,v=this.sprintBlend*-.16,y=1-this.adsBlend,b=e.crouched?.035*y:0,x=e.prone?.018*y:0,S=(1-this.switchBlend)*-.34,C=0,w=0,T=0;if(this.reloadDuration>0){T=Bt.clamp((performance.now()-this.reloadStart)/this.reloadDuration,0,1),t.push(...dg(this.active,this.reloadLastProgress,T)),this.reloadLastProgress=T;let e=Math.sin(Math.PI*T),n=T>.65?Math.sin((T-.65)/.35*Math.PI):0;C=e*.78-n*.12,w=e*-.22+n*.035,T>=1&&(this.reloadDuration=0,this.reloadLastProgress=0)}let E=fg(this.active,T),D=a?.getObjectByName(this.active===`carbine`?`curved-magazine`:`straight-magazine`);D&&(D.userData.restY===void 0&&(D.userData.restX=D.position.x,D.userData.restY=D.position.y,D.userData.restZ=D.position.z,D.userData.restRotationZ=D.rotation.z),D.position.x=Number(D.userData.restX)+E.magazineLateral,D.position.y=Number(D.userData.restY)-E.magazineDrop,D.position.z=Number(D.userData.restZ)+E.magazineForward,D.rotation.z=Number(D.userData.restRotationZ)+E.magazineTwist);let ee=a?.getObjectByName(`reload-shell`);if(ee&&(ee.visible=E.shellVisible,ee.position.set(-.16+E.shellTravel*.13,-.13+E.shellTravel*.035,-.02)),u&&E.actionPull>0){let e=Number(u.userData.restZ??-.48);u.position.z=e+E.actionPull*.16}if(l&&E.actionPull>0){let e=Number(l.userData.restZ??0);l.position.z=e+E.actionPull*(this.active===`smg`?.1:.12)}let te=Bt.clamp((performance.now()-this.meleeStart)/430,0,1),O=this.meleeStart>0&&te<1?Math.sin(te*Math.PI):0,ne=Bt.clamp((performance.now()-this.grenadeStart)/620,0,1),re=this.grenadeStart>0&&ne<1?Math.sin(ne*Math.PI):0,k=new z(.36+h+f+this.swayX-e.lateralSpeed*.012-O*.24+re*.18,-.38+g+p+m+v+b+x+S+w-this.recoil*.08-e.landingImpulse*.075,-.78+_+this.recoil*o.recoilTranslation-O*.32+re*.24);return this.root.position.lerp(k,n(18)),this.root.rotation.x=Bt.lerp(this.root.rotation.x,this.recoil*o.recoilRotation-this.swayY-re*.42,n(22)),this.root.rotation.y=Bt.lerp(this.root.rotation.y,-this.swayX*2-this.sprintBlend*.38-O*.65,n(13)),this.root.rotation.z=Bt.lerp(this.root.rotation.z,C-this.sprintBlend*.22-e.lateralSpeed*(e.prone?.01:.025)+O*.42,n(13)),r&&this.solveArms(r,a,E),t}},gg=`atomic-acres-render-profile`,_g=new Set([`balanced`,`quality`,`compat`]);function vg(e,t){let n=new URLSearchParams(e).get(`render`);return n===`performance`?`balanced`:n&&_g.has(n)?n:t&&_g.has(t)?t:`balanced`}function yg(e){return e===`compat`?{profile:e,representation:`compat`,reducedRepresentation:!0,reducedWorldDetail:!0,reducedPresentationDetail:!0,staticMaterialMode:`palette-basic`,antialias:!1,shadows:!1,shadowMode:`off`,pixelRatioCap:.2,shadowMapSize:0}:e===`quality`?{profile:e,representation:`full`,reducedRepresentation:!1,reducedWorldDetail:!1,reducedPresentationDetail:!1,staticMaterialMode:`preserve`,antialias:!0,shadows:!0,shadowMode:`dynamic`,pixelRatioCap:1.5,shadowMapSize:1024}:{profile:e,representation:`responsive`,reducedRepresentation:!0,reducedWorldDetail:!0,reducedPresentationDetail:!0,staticMaterialMode:`palette-basic`,antialias:!0,shadows:!1,shadowMode:`off`,pixelRatioCap:.85,shadowMapSize:0}}window.addEventListener(`error`,e=>{console.error(`[Atomic Acres runtime error]`,e.message||`unknown error`,e.error?.stack||``)}),window.addEventListener(`unhandledrejection`,e=>{let t=e.reason instanceof Error?`${e.reason.message}\n${e.reason.stack??``}`:String(e.reason);console.error(`[Atomic Acres unhandled rejection]`,t)});var bg=[`carbine`,`smg`,`scattergun`],xg=pf.map(([e,t])=>new z(e,0,t));function Sg(){return typeof globalThis.crypto?.randomUUID==`function`?globalThis.crypto.randomUUID():`player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}var Cg=document.querySelector(`#app`);if(!Cg)throw Error(`Missing #app root`);Cg.innerHTML=`
  <canvas id="game" aria-label="Atomic Acres multiplayer arena"></canvas>
  <div id="color-grade"></div><div id="film-grain"></div>
  <div id="vignette"></div><div id="damage-flash"></div><div id="damage-direction"><i></i></div>
  <section id="menu" class="panel">
    <div class="eyebrow">ORIGINAL WEB ARENA · RESPONSIVE SYNC PASS 12</div>
    <h1>ATOMIC <span>ACRES</span></h1>
    <p class="lede">Three original weapon families meet readable garden, transit, service and model-home routes with a complete score race and rematch flow.</p>
    <nav class="menu-tabs" aria-label="Deployment menu">
      <button type="button" data-menu-tab="deploy" class="active" aria-selected="true">DEPLOY</button>
      <button type="button" data-menu-tab="kit" aria-selected="false">FIELD KIT</button>
      <button type="button" data-menu-tab="options" aria-selected="false">OPTIONS</button>
    </nav>
    <div class="menu-panel active" data-menu-panel="deploy">
      <div class="setup-grid">
        <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" value="Player${Math.floor(Math.random()*900+100)}"></label>
        <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
      </div>
      <div id="selected-kit-summary" class="selected-kit-summary"></div>
      <div class="menu-actions">
        <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
        <button id="solo" class="primary">BOT SKIRMISH</button>
        <button id="host">HOST LOBBY</button>
      </div>
      <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
      <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button">COPY</button></div>
      <div id="network-status" data-kind="ok">Ready for deployment.</div>
    </div>
    <div class="menu-panel" data-menu-panel="kit" hidden>
      <div class="kit-heading"><div><b>FIELD KIT</b><span>Choose the primary issued on deployment.</span></div><small>Changes made mid-life queue for the next deployment.</small></div>
      <div class="kit-grid">
        ${Tf.map(e=>`<button type="button" class="kit-card" data-kit-id="${e.id}">
          <span>${e.role}</span><strong>${e.title}</strong><b>${Gf[e.weapon].name}</b><p>${e.summary}</p>
          <i>${e.traits.join(` · `)}</i><em>SELECTED</em>
        </button>`).join(``)}
      </div>
    </div>
    <div class="menu-panel" data-menu-panel="options" hidden>
      <div class="options-heading"><b>OPTIONS</b><span>Input and view settings apply immediately.</span></div>
      <div class="settings-grid">
        <label>MOUSE SENSITIVITY<input id="sensitivity" type="range" min="0.6" max="2" step="0.05" value="1"></label>
        <label>CONTROLLER LOOK<input id="controller-sensitivity" type="range" min="0.5" max="1.8" step="0.05" value="1"></label>
        <label>FIELD OF VIEW<input id="field-of-view" type="range" min="70" max="100" step="1" value="82"></label>
        <label>GRAPHICS<select id="graphics-profile"><option value="balanced">RESPONSIVE</option><option value="quality">QUALITY</option><option value="compat">COMPATIBILITY</option></select></label>
      </div>
      <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>Z/CTRL</b> prone · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> melee · <b>G</b> frag · <b>1–3</b> weapons · <b>TAB</b> roster<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>D-PAD DOWN</b> prone · <b>X</b> reload · <b>Y</b> switch</div>
      <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
    </div>
  </section>
  <div id="refresh-warning" hidden><strong>30 HZ DISPLAY LIMIT</strong><span>Set Windows Advanced display or the remote-stream client to 60 Hz+ for synchronized motion.</span></div>
  <div id="hud" hidden>
    <header id="matchbar"><div><span class="tiny">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua">AQUA <b id="aqua-score">0</b></span><i>25</i><span class="coral"><b id="coral-score">0</b> CORAL</span></div><div id="connection-pill">SOLO</div></header>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="killfeed"></div>
    <div id="objective">ATOMIC ACRES · FIRST TO 25</div>
    <canvas id="minimap" width="180" height="180" aria-label="Tactical minimap"></canvas>
    <div id="location-label">ATOM-LINER CROSSING</div>
    <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
    <div id="weapon-block"><span id="weapon-name">M86 CARBINE</span><div><b id="ammo">30</b><i>/</i><em id="reserve">120</em></div><small id="reload-state"></small></div>
    <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×1</b><small>V MELEE · G THROW</small></div>
    <div id="room-hud"></div>
    <div id="respawn" hidden><strong>ELIMINATED</strong><span id="respawn-countdown">REDEPLOYING</span></div>
    <div id="countdown" hidden></div>
    <div id="banner" hidden></div>
    <div id="roster" hidden><h2>FIELD ROSTER</h2><div id="roster-list"></div></div>
  </div>
`;function Z(e){let t=document.querySelector(e);if(!t)throw Error(`Missing element ${e}`);return t}var wg=Z(`#game`),Tg=Z(`#menu`),Eg=Z(`#hud`),Dg=Z(`#room-card`),Og=Z(`#room-code`),kg=Z(`#network-status`),Ag=Z(`#minimap`),jg=Ag.getContext(`2d`);if(!jg)throw Error(`Canvas2D minimap is unavailable`);var Mg=jg,Ng=new jf,Pg=vg(window.location.search,localStorage.getItem(gg)),Fg=yg(Pg),Ig=Fg.reducedPresentationDetail,Lg=Fg.reducedWorldDetail,Rg=Fg.staticMaterialMode;document.documentElement.classList.toggle(`compat-render`,Pg===`compat`),document.documentElement.dataset.renderProfile=Pg;var zg=new Ad({canvas:wg,antialias:Fg.antialias,powerPreference:`high-performance`});zg.outputColorSpace=Ze,zg.shadowMap.enabled=Fg.shadows,zg.shadowMap.type=1,zg.shadowMap.autoUpdate=Fg.shadowMode===`dynamic`,zg.shadowMap.needsUpdate=Fg.shadowMode===`static`,zg.toneMapping=4,zg.toneMappingExposure=1.14,zg.setPixelRatio(Math.min(window.devicePixelRatio,Fg.pixelRatioCap));var Bg=new qn;Bg.fog=new Kn(11978177,70,142);var Vg=new Bs(76,1,.08,180);Vg.rotation.order=`YXZ`,Bg.add(Vg);function Hg(){let e=new U(new Go(150,Ig?20:32,Ig?12:18),new ts({side:1,depthWrite:!1,fog:!1,uniforms:{top:{value:new H(2382722)},horizon:{value:new H(12177869)},bottom:{value:new H(14862750)},sunColor:{value:new H(16765850)},cloudColor:{value:new H(15265511)},sunDirection:{value:new z(-.39,.83,.42).normalize()},cloudStrength:{value:Ig?0:.035}},vertexShader:`
      varying vec3 skyDirection;
      void main(){
        skyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      varying vec3 skyDirection;
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      uniform vec3 sunColor;
      uniform vec3 cloudColor;
      uniform vec3 sunDirection;
      uniform float cloudStrength;
      void main(){
        vec3 direction = normalize(skyDirection);
        float h = direction.y;
        vec3 color = h > 0.0
          ? mix(horizon, top, smoothstep(0.0, 0.78, h))
          : mix(horizon, bottom, smoothstep(0.0, -0.38, h));
        float sunDot = max(dot(direction, sunDirection), 0.0);
        float sunDisc = pow(sunDot, 420.0);
        float sunHalo = pow(sunDot, 18.0) * 0.28;
        ${Ig?``:`
        float azimuth = atan(direction.z, direction.x);
        float highBand = 1.0 - smoothstep(0.0, 0.075, abs(h - 0.48));
        float lowBand = 1.0 - smoothstep(0.0, 0.06, abs(h - 0.3));
        float waveA = 0.5 + 0.5 * sin(azimuth * 8.0 + sin(azimuth * 3.0) * 1.8);
        float waveB = 0.5 + 0.5 * sin(azimuth * 17.0 - h * 12.0);
        float cloudMask = smoothstep(0.62, 0.9, waveA * 0.72 + waveB * 0.28) * max(highBand, lowBand * 0.72);
        color = mix(color, cloudColor, cloudMask * cloudStrength);
        `}
        color += sunColor * (sunDisc * 1.4 + sunHalo);
        gl_FragColor = vec4(color, 1.0);
      }
    `}));e.name=`procedural-atmosphere-sky`,e.frustumCulled=!1,e.onBeforeRender=()=>e.position.copy(Vg.position),Bg.add(e),Bg.add(new Os(14479359,5070918,1.48)),Bg.add(new Ks(13095892,.38));let t=new Gs(16767397,2.8);t.position.set(-32,68,34),t.castShadow=Fg.shadows,Fg.shadows&&t.shadow.mapSize.set(Fg.shadowMapSize,Fg.shadowMapSize),t.shadow.camera.left=-48,t.shadow.camera.right=48,t.shadow.camera.top=54,t.shadow.camera.bottom=-54,t.shadow.camera.near=10,t.shadow.camera.far=150,t.shadow.bias=-28e-5,t.shadow.normalBias=.025,Bg.add(t)}Hg();var Q=mp(Bg),Ug=new zp(Bg,Ig),Wg=new ag(Bg),Gg=null,$={id:Sg(),name:`Player`,team:0,position:new z,velocity:new z,yaw:0,pitch:0,hp:100,kills:0,deaths:0,weapon:`carbine`,ammo:{carbine:Gf.carbine.mag,smg:Gf.smg.mag,scattergun:Gf.scattergun.mag},reserve:{carbine:Gf.carbine.reserve,smg:Gf.smg.reserve,scattergun:Gf.scattergun.reserve},reloadState:null,switchingUntil:0,lastShotAt:0,nextShotAt:0,sustainedShots:0,stance:`stand`,grenades:1,lastMeleeAt:-1e4,alive:!0,invulnerableUntil:0,seq:0},Kg=new Set,qg=new Map,Jg=new Map,Yg=[],Xg=new Set,Zg=new Map,Qg=[],$g=!1,e_=`solo`,t_=!1,n_=0,r_=0,i_=0,a_={pitch:0,yaw:0},o_=0,s_=0,c_=0,l_=0,u_=!1,d_=0,f_=0,p_=0,m_=0,h_=-1e4,g_=-1e4,__={distance:0,side:0},v_=performance.now(),y_=new Hp,b_=0,x_=new URLSearchParams(window.location.search).get(`renderPaused`)===`1`,S_=dp(performance.now()),C_=!1,w_=0,T_=[0,0],E_=!1,D_=!1,O_=!1,k_={x:0,y:0},A_={yaw:0,pitch:0},j_=!1,M_=!0,N_=!0,P_=[],F_=!1,I_=!1,L_=1,R_=1,z_=82,B_=!1,V_=!1,H_=null,U_=null;function W_(){return $g&&$.alive&&S_.phase===`active`&&Tg.classList.contains(`hidden`)}function G_(){return $g&&$.alive&&S_.phase!==`ended`&&Tg.classList.contains(`hidden`)}function K_(e=!1,t=performance.now()){if(!$.reloadState){Q_.cancelReload();return}(e||ip($.reloadState,t))&&($.reloadState=null,Q_.cancelReload())}function q_(){K_(!1),Kg.clear(),k_={x:0,y:0},A_={yaw:0,pitch:0},j_=!1,D_=!1,O_=!1,t_=!1,E_=!1,u_=!1,h_=-1e4,$.velocity.x=0,$.velocity.z=0}function J_(e,t=`ok`){kg.textContent=e,kg.dataset.kind=t}function Y_(e){let t=e instanceof Error?e.message:String(e);t_=!1,J_(`Game paused: ${t}`,`error`),Tg.classList.remove(`hidden`);let n=Z(`#banner`);n.innerHTML=`<strong>SYSTEM PAUSED</strong><span>Reload the page to re-enter the test block.</span>`,n.hidden=!1,console.error(`[Atomic Acres fatal]`,e)}var X_=typeof window.RTCPeerConnection==`function`;X_?typeof wg.requestPointerLock!=`function`&&J_(`Pointer lock is unavailable; keyboard movement works but mouse aim may not.`,`warn`):(Z(`#host`).disabled=!0,Z(`#join`).disabled=!0,J_(`This browser lacks WebRTC; solo training is still available.`,`warn`)),wg.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),Y_(Error(`Graphics context was lost`))}),wg.addEventListener(`webglcontextrestored`,()=>window.location.reload());var Z_=new qh(sv,J_),Q_=new hg(Vg,Ig),$_=kf(localStorage.getItem(Df));function ev(e){document.querySelectorAll(`[data-menu-tab]`).forEach(t=>{let n=t.dataset.menuTab===e;t.classList.toggle(`active`,n),t.setAttribute(`aria-selected`,String(n))}),document.querySelectorAll(`[data-menu-panel]`).forEach(t=>{let n=t.dataset.menuPanel===e;t.classList.toggle(`active`,n),t.hidden=!n})}function tv(){let e=Of($_),t=$g&&$.weapon!==e.weapon;Z(`#selected-kit-summary`).innerHTML=`<span>${t?`QUEUED NEXT DEPLOYMENT`:`ACTIVE FIELD KIT`}</span><strong>${e.title}</strong><b>${Gf[e.weapon].name}</b>`,document.querySelectorAll(`[data-kit-id]`).forEach(e=>{let t=e.dataset.kitId===$_;e.classList.toggle(`selected`,t),e.setAttribute(`aria-pressed`,String(t))})}function nv(e){$_=Of(e).id,localStorage.setItem(Df,Af($_)),$g||($.weapon=Of($_).weapon,Q_.setWeapon($.weapon,!0)),tv()}document.querySelectorAll(`[data-menu-tab]`).forEach(e=>{e.addEventListener(`click`,()=>ev(e.dataset.menuTab))}),document.querySelectorAll(`[data-kit-id]`).forEach(e=>{e.addEventListener(`click`,()=>nv(e.dataset.kitId??`balanced`))}),$.weapon=Of($_).weapon,tv();var rv=new Hs(14938623,1.35,5);rv.position.set(0,.4,.2),Vg.add(rv);function iv(e){return e===`prone`?.5:e===`crouch`?1.16:1.7}function av(e){let t=new Rn;t.name=`remote-player-world`,t.rotation.order=`YXZ`,t.userData.playerId=e.id;let n=sf(e.team,`remote-player-model`,Ig,e.weapon);n.userData.playerId=e.id,n.traverse(n=>{n.userData.playerId=e.id,n.userData.targetRoot=t}),t.userData.operator=n,t.add(n);let r=document.createElement(`canvas`);r.width=256,r.height=64;let i=r.getContext(`2d`);i.fillStyle=`rgba(10,18,22,.72)`,i.fillRect(0,0,256,64),i.fillStyle=`#f7ecd4`,i.font=`700 30px Arial`,i.textAlign=`center`,i.textBaseline=`middle`,i.fillText(e.name,128,32);let a=new ga(r);a.colorSpace=Ze;let o=new si(new qr({map:a,transparent:!0,depthTest:!0,depthWrite:!1}));return o.visible=e.team===$.team,o.position.y=2.5,o.scale.set(2.4,.6,1),t.add(o),t.position.set(e.x,e.y-iv(e.stance),e.z),Bg.add(t),{root:t,snapshot:e,target:new z(e.x,e.y-iv(e.stance),e.z),targetYaw:e.yaw,lastSeen:performance.now()}}function ov(){return{id:$.id,name:$.name,team:$.team,x:$.position.x,y:$.position.y,z:$.position.z,yaw:$.yaw,pitch:$.pitch,hp:$.hp,kills:$.kills,deaths:$.deaths,weapon:$.weapon,stance:$.stance,seq:++$.seq}}function sv(e){if(e.type===`join`||e.type===`state`){let t=e.player;if(t.id===$.id||!Bf(t,Q.bounds,.44))return;let n=qg.get(t.id);n||(n=av(t),qg.set(t.id,n),Hv(`${t.name} entered the test block`,t.team===0?`aqua`:`coral`),e.type===`join`&&Z_.send({type:`state`,player:ov()})),t.seq>=n.snapshot.seq&&(n.snapshot=t,n.target.set(t.x,t.y-iv(t.stance),t.z),n.targetYaw=t.yaw,n.lastSeen=performance.now(),n.root.visible=t.hp>0);return}if(e.type===`shot`){if(e.by===$.id)return;let t=qg.get(e.by),n=Zg.get(e.by)??Yh(),r=Xh(e,t?.snapshot,performance.now(),n);if(!r.accepted)return;Zg.set(e.by,r.nextState),lv(e);return}if(e.type===`hit`&&e.target===$.id&&!Xg.has(e.nonce)){let t=qg.get(e.by);if(!t||!Bf(t.snapshot,Q.bounds,.44))return;let n={x:t.snapshot.x,y:t.snapshot.y,z:t.snapshot.z};if(Q.colliders.some(e=>Ff(n,$.position,e)))return;Xg.add(e.nonce),dv(e.damage,e.by),cv();return}if(e.type===`death`&&!Xg.has(e.nonce)){Xg.add(e.nonce),fv(e),cv();return}e.type===`leave`&&pv(e.playerId,`left the block`)}function cv(){Xg.size>512&&Xg.clear()}function lv(e){let t=new z(...e.origin);if(!Bf(t,Q.bounds,.44))return;let n=new z(...e.direction).normalize(),r=Lf(t,n,50,t.clone().addScaledVector(n,50),0,Q.colliders),i=t.clone().addScaledVector(n,r.tracerDistance),a=qg.get(e.by)?.root.userData.operator,o=a?.getObjectByName(`muzzle-socket`)?.getWorldPosition(new z);Bv(o??t,i,Gf[e.weapon].color),a&&rf(a),r.blockedByCover&&(zv(i,`concrete`,n.clone().multiplyScalar(-1)),Ng.impact(`concrete`,i.distanceTo(Vg.position))),$.alive&&Ng.nearMiss(Cf($.position,t,i)),Ng.shot(e.weapon,!0,t.distanceTo(Vg.position))}function uv(e){let t=qg.get(e)?.target??Jg.get(e)?.position;if(!t||e===$.id)return;let n=t.x-$.position.x,r=t.z-$.position.z,i=Math.atan2(-n,-r),a=Z(`#damage-direction`);a.style.setProperty(`--damage-angle`,`${Hf($.yaw,i)}rad`),a.classList.remove(`pulse`),requestAnimationFrame(()=>a.classList.add(`pulse`))}function dv(e,t){let n=performance.now();if(!(!$.alive||n<$.invulnerableUntil)&&($.hp=Math.max(0,$.hp-Math.min(100,Math.max(1,e))),g_=n,Ng.damage(),uv(t),Z(`#damage-flash`).classList.remove(`pulse`),requestAnimationFrame(()=>Z(`#damage-flash`).classList.add(`pulse`)),$.hp<=0)){K_(!0,n),$.alive=!1,$.deaths+=1;let e={type:`death`,killer:t,victim:$.id,nonce:yv()};Z_.send(e),fv(e),Z(`#respawn`).hidden=!1,w_=n+1900,document.exitPointerLock(),setTimeout(_v,1900)}}function fv(e){let t=e.killer===$.id?$.name:qg.get(e.killer)?.snapshot.name??Jg.get(e.killer)?.name??`Unknown`,n=e.victim===$.id?$.name:qg.get(e.victim)?.snapshot.name??Jg.get(e.victim)?.name??`Unknown`;e.killer===$.id&&e.victim!==$.id&&($.kills+=1,Ng.kill()),Hv(`${t} eliminated ${n}`,e.killer===$.id?`gold`:void 0);let r=qg.get(e.victim);r&&(r.root.visible=!1);let i=Jg.get(e.victim);i&&(i.root.visible=!1),qv()}function pv(e,t){let n=qg.get(e);n&&(Bg.remove(n.root),qg.delete(e),Zg.delete(e),Hv(`${n.snapshot.name} ${t}`))}function mv(){let e=Q.spawns[$.team],t=e_===`client`?Math.min(1,e.length-1):e_===`host`?0:$.deaths%e.length,n=[...[...qg.values()].map(e=>new z(e.snapshot.x,e.snapshot.y,e.snapshot.z)),...[...Jg.values()].filter(e=>e.alive).map(e=>e.position.clone())],r=[...[...qg.values()].filter(e=>e.snapshot.team!==$.team&&e.snapshot.hp>0).map(e=>new z(e.snapshot.x,e.snapshot.y,e.snapshot.z)),...[...Jg.values()].filter(e=>e.team!==$.team&&e.alive).map(e=>e.position.clone().add(new z(0,1.42,0)))],i=e.map((e,t)=>({point:e,index:t})).filter(({point:e})=>{let t={x:e.x,y:0,z:e.z};return Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.z)&&Bf(t,Q.bounds,.44)&&!Rf(t,Q.colliders,.44)});if(i.length===0)throw Error(`No valid authored player spawn for team ${$.team}`);let a=i.map(({point:e,index:i})=>{let a=r.length===0?0:Math.min(...r.map(t=>t.distanceToSquared(e))),o=r.filter(t=>!Q.colliders.some(n=>Ff(t,e,n))).length;return{point:e,index:i,score:mf({nearestThreatDistanceSq:a,visibleThreats:o,occupied:n.some(t=>t.distanceToSquared(e)<20),preferred:i===t})}});return a.sort((e,t)=>t.score-e.score||e.index-t.index),a[0].point.clone()}function hv(){try{let e=wg.requestPointerLock();e instanceof Promise&&e.catch(()=>void 0)}catch{}}function gv(e){if(!U_||!$.alive||!F_)return!1;let t=Xf($.stance,e);if(t===$.stance)return!0;let n=$.stance,r=U_.eyePosition();if(!U_.setStance(t))return J_(`Low clearance — stance change blocked.`,`warn`),!1;let i=U_.eyePosition();return c_+=r.y-i.y,$.position.set(i.x,i.y,i.z),$.stance=t,d_=performance.now()+(t===`prone`?260:n===`prone`?290:135),u_=!1,!0}function _v(e=!0){K_(!0),$.stance=`stand`,U_?.setStance(`stand`),$.position.copy(mv()),U_?.teleportEye($.position),$.velocity.set(0,0,0),$.hp=100,g_=-1e4,$.grenades=1,$.reloadState=null,$.alive=!0,w_=0,$.invulnerableUntil=performance.now()+1350,$.yaw=$.team===0?Math.PI:0,$.pitch=0,a_={pitch:0,yaw:0},d_=0,f_=0,p_=0,c_=0,l_=0,h_=-1e4,__={distance:0,side:0};let t=Of($_).weapon;$.weapon!==t&&($.weapon=t,$.switchingUntil=0,Q_.setWeapon(t,!0)),tv(),Z(`#respawn`).hidden=!0,$g&&e&&hv(),Z_.send({type:`state`,player:ov()})}function vv(e,t=!0){$.name=Kh(Z(`#player-name`).value),$.team=+(Number(Z(`#team`).value)===1),$g=!0,Q_.root.visible=!0,e_=e,B_=!1,S_=dp(performance.now()),C_=!1,T_=[0,0],w_=0,Tg.classList.add(`hidden`),Eg.hidden=!1,Z(`#connection-pill`).textContent=e===`solo`?`BOT SKIRMISH`:e===`host`?`HOST`:`PEER`,Z(`#room-hud`).textContent=Z_.roomCode?`ROOM ${Z_.roomCode.slice(0,8).toUpperCase()}`:``,_v(t),e===`solo`&&Ev(),Ng.unlock(),Hv(`Welcome to Atomic Acres`,`gold`),e!==`solo`&&Z_.send({type:`join`,player:ov()})}function yv(){return Math.floor(performance.now()*1e3+Math.random()*1e6)}function bv(e){let t=bg[e];if(!(!t||t===$.weapon||!$.alive)){if($.reloadState){if(!ip($.reloadState,performance.now()))return;$.reloadState=null,Q_.cancelReload()}$.weapon=t,$.switchingUntil=performance.now()+360,$.sustainedShots=0,Q_.setWeapon(t),Ng.weaponSwitch()}}function xv(){if(!$.alive||S_.phase!==`active`)return;let e=Gf[$.weapon],t=$.ammo[$.weapon];$.reloadState||t>=e.mag||$.reserve[$.weapon]<=0||($.reloadState=rp(e,t,$.reserve[$.weapon],performance.now()),Qg.length=0,Ng.reload(),Q_.reload(e.reload),Hv(`Reloading ${e.name}`))}function Sv(e){if(!$.reloadState)return;let t=ap($.reloadState,e,$.ammo[$.weapon],$.reserve[$.weapon]);t.completed&&($.ammo[$.weapon]=t.ammo,$.reserve[$.weapon]=t.reserve,$.reloadState=null,Q_.cancelReload())}function Cv(e){if(!$.alive||!$g||!V_&&document.pointerLockElement!==wg||S_.phase!==`active`)return;u_&&(u_=!1,f_=Math.max(f_,e+150));let t=Math.max(d_,f_);if(e<t){p_<t&&(p_=t,window.setTimeout(()=>{p_=0,t_&&Cv(performance.now())},Math.max(1,t-e+2)));return}p_=0;let n=Gf[$.weapon];if(!t_&&n.automatic||e<$.switchingUntil)return;if($.reloadState){if(!ip($.reloadState,e))return;$.reloadState=null,Q_.cancelReload()}let r=6e4/n.rpm;if(e<$.nextShotAt)return;if(($.nextShotAt===0||e-$.nextShotAt>r*2)&&($.nextShotAt=e),$.nextShotAt+=r,$.ammo[$.weapon]<=0){Ng.empty(),xv(),$.lastShotAt=e;return}$.sustainedShots=e-$.lastShotAt<260?$.sustainedShots+1:0,$.lastShotAt=e,--$.ammo[$.weapon];let i=Z(`#ammo`);i.classList.remove(`fired`),requestAnimationFrame(()=>i.classList.add(`fired`));let a=sp(n,$.sustainedShots,Math.random());a_.pitch=Math.min(.16,a_.pitch+a.pitch),a_.yaw=Bt.clamp(a_.yaw+a.yaw,-.075,.075),i_=Math.min(.24,i_+a.pitch*4.2),Q_.fire(a.pitch),Ng.shot($.weapon);let o=Vg.getWorldPosition(new z),s=Vg.getWorldDirection(new z),c=Math.hypot($.velocity.x,$.velocity.z)>1.2,l=ep(n,{ads:E_&&Q_.adsProgress()>=.9,moving:c,crouched:$.stance===`crouch`,prone:$.stance===`prone`,sustainedShots:$.sustainedShots}),u=new Map,d=!1,f=new z(1,0,0).applyQuaternion(Vg.quaternion),p=new z(0,1,0).applyQuaternion(Vg.quaternion);for(let e=0;e<n.pellets;e+=1){let e=tp(l,Math.random(),Math.random()),t=s.clone().addScaledVector(f,e.x).addScaledVector(p,e.y).normalize(),r=wv(o,t),i=o.clone().addScaledVector(t,r.distance);if(Bv(Q_.muzzleWorldPosition(new z)??o,i,n.color),!r.playerId&&!r.targetId&&r.distance<89){let e=r.impactPoint??o.clone().addScaledVector(t,r.distance),n=r.impactNormal??t.clone().multiplyScalar(-1),i=r.impactSurface??`concrete`;zv(e,i,n),d||(d=!0,Ng.impact(i,e.distanceTo(Vg.position)))}if(r.playerId){let e=r.hitZone??`body`,t=np(n,r.distance,e),i=u.get(r.playerId);u.set(r.playerId,{damage:(i?.damage??0)+t,zone:i?.zone===`head`||e===`head`?`head`:e})}r.targetId&&Lv(r.targetId)}for(let[e,t]of u){let n=Jg.get(e);if(n)Av(n,Math.min(100,t.damage),t.zone);else{let n=qg.get(e);if(n&&n.snapshot.team!==$.team){let r=n.root.userData.operator;r&&af(r,t.zone);let i=yv();Z_.send({type:`hit`,by:$.id,target:e,damage:Math.min(100,t.damage),nonce:i}),Vv(t.zone===`head`),Ng.hit(t.zone===`head`)}}}let m={type:`shot`,by:$.id,weapon:$.weapon,origin:o.toArray(),direction:s.toArray(),nonce:yv()};Z_.send(m),$.ammo[$.weapon]===0&&setTimeout(xv,120)}function wv(e,t){let n=new uc(e,t,.1,110),r=[...qg.values()].filter(e=>e.root.visible).map(e=>e.root),i=[...Jg.values()].filter(e=>e.alive&&e.root.visible).map(e=>e.root),a=Q.targets.filter(e=>e.active).map(e=>e.root),o=n.intersectObjects([...Q.raycastMeshes,...r,...i,...a],!0)[0];if(!o)return{distance:90};let s=o.object,c,l,u,d,f=[];for(;s;)c??=s.userData.playerId,l??=s.userData.targetId,u??=s.userData.hitZone,d??=s.userData.impactSurface,s.name&&f.push(s.name),s=s.parent;let p=o.object.userData.targetRoot;l??=p?.userData.targetId;let m=o.object instanceof U?Array.isArray(o.object.material)?o.object.material[0]:o.object.material:void 0,h=m instanceof W?m.metalness:void 0,g=o.face?.normal.clone().transformDirection(o.object.matrixWorld)??t.clone().multiplyScalar(-1);return{distance:Math.min(o.distance,110),playerId:c,targetId:l,hitZone:u,impactPoint:o.point.clone(),impactNormal:g,impactSurface:xf({hint:d,name:f.join(` `),metalness:h})}}function Tv(e,t){let n=Q.spawns[e],r=[...$.alive&&$.team!==e?[$.position.clone()]:[],...[...qg.values()].filter(t=>t.snapshot.team!==e&&t.snapshot.hp>0).map(e=>new z(e.snapshot.x,e.snapshot.y,e.snapshot.z))],i=[...[...qg.values()].map(e=>e.target.clone()),...[...Jg.values()].filter(e=>e.alive).map(e=>e.position.clone())],a=n.map((e,t)=>({candidate:e,index:t})).filter(({candidate:e})=>{let t={x:e.x,y:0,z:e.z};return Number.isFinite(e.x)&&Number.isFinite(e.z)&&Bf(t,Q.bounds,.44)&&!Rf(t,Q.colliders,.44)});if(a.length===0)throw Error(`No valid authored spawn for team ${e}`);let o=a.map(({candidate:e,index:a})=>{let o=r.length===0?0:Math.min(...r.map(t=>t.distanceToSquared(e))),s=r.filter(t=>!Q.colliders.some(n=>Ff(e,t,n))).length;return{candidate:e,index:a,score:mf({nearestThreatDistanceSq:o,visibleThreats:s,occupied:i.some(t=>t.distanceToSquared(e)<20),preferred:a===(t%n.length+n.length)%n.length})}});return o.sort((e,t)=>t.score-e.score||e.index-t.index),o[0].candidate}function Ev(){Dv();let e=+($.team===0);[`RIVET`].slice(0,1).forEach((t,n)=>{let r=`bot-${n}`,i=sf(e,`bot-operator`,Ig);i.userData.playerId=r,i.traverse(e=>{e.userData.playerId=r,e.userData.targetRoot=i});let a=Tv(e,n),o=new z(a.x,a.y-1.7,a.z);i.position.copy(o),Bg.add(i),Jg.set(r,{id:r,name:t,team:e,root:i,position:o,velocity:new z,hp:100,alive:!0,kills:0,deaths:0,lastShotAt:0,lastSightAt:0,hasLineOfSight:!1,sightStartedAt:0,burstShots:0,nextDecisionAt:0,strafeSign:n%2==0?1:-1,invulnerableUntil:performance.now()+1e3,respawnAt:0,waypoint:n,blockedSince:0})}),Hv(`One hostile operator entered the block`,`coral`)}function Dv(){for(let e of Jg.values())Bg.remove(e.root);Jg.clear()}function Ov(e){let t={x:e.position.x,y:e.position.y+1.42,z:e.position.z},n={x:$.position.x,y:$.position.y,z:$.position.z};return!Q.colliders.some(e=>Ff(t,n,e))}function kv(e){let t={x:$.position.x,y:$.position.y,z:$.position.z};return gf(xg.map((n,r)=>{let i={x:n.x,y:1.42,z:n.z};return{index:r,distanceFromBot:n.distanceTo(e.position),distanceFromPlayer:n.distanceTo($.position),seesPlayer:$.alive&&!Q.colliders.some(e=>Ff(i,t,e))}}),e.waypoint,e.deaths+e.kills)}function Av(e,t,n){let r=performance.now();!e.alive||r<e.invulnerableUntil||(af(e.root,n),e.hp=Math.max(0,e.hp-t),Vv(n===`head`),Ng.hit(n===`head`),!(e.hp>0)&&(e.alive=!1,e.deaths+=1,e.respawnAt=r+2200,e.root.visible=!1,$.kills+=1,Ng.kill(),Hv(`${$.name} eliminated ${e.name}${n===`head`?` · HEADSHOT`:``}`,`gold`),qv()))}function jv(e,t){let n=yf(t),r=Tv(e.team,e.deaths+e.waypoint);e.position.set(r.x,r.y-1.7,r.z),e.root.position.copy(e.position),e.hp=n.health,e.alive=n.alive,e.invulnerableUntil=n.invulnerableUntil,e.lastShotAt=n.lastShotAt,e.lastSightAt=0,e.hasLineOfSight=!1,e.sightStartedAt=0,e.burstShots=0,e.nextDecisionAt=0,e.blockedSince=0,e.root.visible=!0}function Mv(e,t){if(e_!==`solo`||S_.phase!==`active`||B_)return;let n=0;for(let r of Jg.values()){if(n+=1,!r.alive){t>=r.respawnAt&&!C_&&jv(r,t);continue}if(!Bf(r.position,Q.bounds,.44)){let e=Tv(r.team,r.waypoint);r.position.set(e.x,e.y-1.7,e.z),r.root.position.copy(r.position),r.hasLineOfSight=!1,r.sightStartedAt=0,r.burstShots=0,r.blockedSince=0,r.lastSightAt=t;continue}let i=$.position.clone().setY(0).sub(r.position.clone().setY(0)),a=i.length(),o=120+n*19;if(t-r.lastSightAt>=o){r.lastSightAt=t;let e=r.hasLineOfSight;r.hasLineOfSight=$.alive&&Ov(r),r.hasLineOfSight&&!e&&(r.sightStartedAt=t),r.hasLineOfSight||(e&&(r.waypoint=kv(r)),r.sightStartedAt=0,r.burstShots=0)}let s=r.hasLineOfSight;t>=r.nextDecisionAt&&(r.strafeSign=r.strafeSign===1?-1:1,r.nextDecisionAt=t+850+n*95);let c=xg[r.waypoint%xg.length],l=c.clone().sub(r.position).setY(0),u=l.lengthSq()<5.2;u&&(r.waypoint=s?(r.waypoint+1+n)%xg.length:kv(r));let d=vf({alive:r.alive,distanceToPlayer:a,hasLineOfSight:s,health:r.hp,now:t,lastShotAt:r.lastShotAt,waypointReached:u,random:r.strafeSign===1?.25:.75,lineOfSightSince:r.sightStartedAt,reactionDelay:650,burstShotsRemaining:r.burstShots});d.changeWaypoint&&!u&&(r.waypoint=kv(r)),c=xg[r.waypoint%xg.length],l=c.clone().sub(r.position).setY(0);let f=s?i:l,p=f.lengthSq()>.01?f.normalize():new z(0,0,-1),m=new z(-p.z,0,p.x),h=d.movement===`advance`?p:d.movement===`retreat`?p.clone().multiplyScalar(-1):d.movement===`strafe-left`?m.clone().multiplyScalar(-1):d.movement===`strafe-right`?m:new z,g=d.movement.startsWith(`strafe`)?4.05:s?4.65:5.85,_=r.position.clone().addScaledVector(h,g*e),v=zf(r.position,_,Q.colliders,Q.bounds,.44);if(Math.hypot(v.x-r.position.x,v.z-r.position.z)<.002&&h.lengthSq()>0){let n=r.position.clone().addScaledVector(m,r.strafeSign*g*e*1.5);v=zf(r.position,n,Q.colliders,Q.bounds,.44),Math.hypot(v.x-r.position.x,v.z-r.position.z)<.002?r.blockedSince===0?r.blockedSince=t:t-r.blockedSince>=400&&(r.waypoint=kv(r),r.blockedSince=0):r.blockedSince=0}else r.blockedSince=0;r.position.set(v.x,r.position.y,v.z),r.root.position.copy(r.position);let y=s?$.position:c;if(r.root.lookAt(y.x,r.position.y+1.1,y.z),of(r.root,`stand`,h.lengthSq()>0?g:0,t*.008+n,Math.min(1,e*12)),hf(d.fire,t,r.invulnerableUntil)&&$.alive){r.burstShots<=0&&(r.burstShots=2+n%2),--r.burstShots,r.lastShotAt=t,rf(r.root);let e=r.position.clone().add(new z(0,1.42,0)),i=$.position.clone().sub(e).normalize(),o=_f(a)+r.burstShots*.006;i.x+=(Math.random()-.5)*o,i.y+=(Math.random()-.5)*o,i.z+=(Math.random()-.5)*o,i.normalize();let s=Math.min(a+2,75),c=$.stance===`prone`?.38:$.stance===`crouch`?.48:.55,l=Lf(e,i,s,$.position,c,Q.colliders),u=e.clone().addScaledVector(i,l.tracerDistance),d=r.root.getObjectByName(`muzzle-socket`)?.getWorldPosition(new z);Bv(d??e,u,Gf.carbine.color),l.blockedByCover?(zv(u,`concrete`,i.clone().multiplyScalar(-1)),Ng.impact(`concrete`,u.distanceTo($.position))):l.hitTarget||Ng.nearMiss(Cf($.position,e,u)),Ng.shot(`carbine`,!0),l.hitTarget&&(dv(np(Gf.carbine,a,`body`)*Wf,r.id),$.alive||(r.kills+=1,qv()))}}}function Nv(){let e=performance.now();if(!up(2,e,$.lastMeleeAt).hit||!$.alive||S_.phase!==`active`)return;$.lastMeleeAt=e,Q_.melee(),Ng.melee();let t=wv(Vg.getWorldPosition(new z),Vg.getWorldDirection(new z));if(!t.playerId||t.distance>2.25)return;let n=Jg.get(t.playerId);n?Av(n,70,t.hitZone??`body`):qg.has(t.playerId)&&Z_.send({type:`hit`,by:$.id,target:t.playerId,damage:70,nonce:yv()})}function Pv(){if(!$.alive||$.grenades<=0||S_.phase!==`active`)return;--$.grenades,Q_.throwGrenade();let e=Vg.getWorldDirection(new z),t=Vg.getWorldPosition(new z).addScaledVector(e,.7),n=new U(new Go(.16,14,10),new W({color:3424570,roughness:.55,metalness:.48}));n.position.copy(t),n.castShadow=!0,Bg.add(n),Yg.push({mesh:n,velocity:e.multiplyScalar(13).add(new z(0,5.2,0)),explodeAt:performance.now()+2300,lastBounceAt:0})}function Fv(e){let t=e.mesh.position.clone();Bg.remove(e.mesh),Ng.explosion();let n=new U(new Go(1,20,14),new _i({color:16757324,transparent:!0,opacity:.72}));n.position.copy(t),n.scale.setScalar(.2),Bg.add(n);let r=new Hs(16743214,12,18,2);r.position.copy(t),Bg.add(r);let i=performance.now(),a=()=>{let e=(performance.now()-i)/420;if(e>=1){Bg.remove(n,r);return}n.scale.setScalar(.2+e*5.5),n.material.opacity=.72*(1-e),r.intensity=12*(1-e),requestAnimationFrame(a)};a();for(let e of Jg.values()){let n=e.position.clone().add(new z(0,1.1,0)),r=Q.colliders.some(e=>Ff(t,n,e))?0:lp(e.position.distanceTo(t));r>0&&Av(e,r,`body`)}for(let e of qg.values()){let n=e.target.clone().add(new z(0,1.1,0));if(Q.colliders.some(e=>Ff(t,n,e)))continue;let r=lp(n.distanceTo(t));r>0&&Z_.send({type:`hit`,by:$.id,target:e.snapshot.id,damage:r,nonce:yv()})}let o=Q.colliders.some(e=>Ff(t,$.position,e))?0:lp($.position.distanceTo(t))*.35;o>0&&dv(o,$.id)}function Iv(e,t){for(let n=Yg.length-1;n>=0;--n){let r=Yg[n];r.velocity.y-=18*e;let i=r.mesh.position.clone(),a=r.velocity.clone().multiplyScalar(e),o=Mf(i,a,Q.colliders);if(o){let e=new z(o.normal.x,o.normal.y,o.normal.z);r.mesh.position.copy(i).addScaledVector(a,o.time).addScaledVector(e,.025);let n=r.velocity.dot(e);r.velocity.addScaledVector(e,-(1.38*n)),r.velocity.multiplyScalar(.76),Math.abs(n)>1.8&&t-r.lastBounceAt>90&&(r.lastBounceAt=t,Ng.grenadeBounce(Math.abs(n)))}else r.mesh.position.add(a);if(!Bf(r.mesh.position,Q.bounds,.16)){let e=Vf(r.mesh.position,Q.bounds,.16);r.mesh.position.set(e.x,e.y,e.z),zv(r.mesh.position.clone()),Ng.coverImpact(r.mesh.position.distanceTo($.position)),Bg.remove(r.mesh),r.mesh.geometry.dispose(),r.mesh.material.dispose(),Yg.splice(n,1);continue}if(r.mesh.rotation.x+=e*8,r.mesh.rotation.z+=e*11,r.mesh.position.y<.18){let e=Math.abs(r.velocity.y);e>1.8&&t-r.lastBounceAt>90&&(r.lastBounceAt=t,Ng.grenadeBounce(e)),r.mesh.position.y=.18,r.velocity.y=Math.abs(r.velocity.y)*.42,r.velocity.x*=.72,r.velocity.z*=.72}t>=r.explodeAt&&(Yg.splice(n,1),Fv(r))}}function Lv(e){let t=Q.targets.find(t=>t.id===e);!t||!t.active||(t.active=!1,t.root.visible=!1,t.respawnAt=performance.now()+3200,n_+=1,Vv(),Ng.hit(),Hv(`+1 test mannequin`,`gold`))}function Rv(e){for(let t of Q.targets){if(e_===`solo`){t.root.visible=!1;continue}!t.active&&e>=t.respawnAt&&(t.active=!0,t.root.visible=!0)}}function zv(e,t=`concrete`,n=new z(0,1,0)){Ug.impact(e,n.normalize(),t)}function Bv(e,t,n){Wg.emit(e,t,n)}function Vv(e=!1){let t=Z(`#hitmarker`);t.classList.remove(`show`,`headshot`),e&&t.classList.add(`headshot`),requestAnimationFrame(()=>t.classList.add(`show`))}function Hv(e,t){let n=Z(`#killfeed`),r=document.createElement(`div`);for(r.textContent=e,t&&r.classList.add(t),n.prepend(r);n.children.length>6;)n.lastElementChild?.remove();setTimeout(()=>r.classList.add(`fade`),4200),setTimeout(()=>r.remove(),5e3)}function Uv(e){if(!G_()||!U_)return;let t=new z(-Math.sin($.yaw),0,-Math.cos($.yaw)),n=new z(Math.cos($.yaw),0,-Math.sin($.yaw)),r=Bt.clamp(Number(Kg.has(`KeyW`))-Number(Kg.has(`KeyS`))-k_.y,-1,1),i=Bt.clamp(Number(Kg.has(`KeyD`))-Number(Kg.has(`KeyA`))+k_.x,-1,1),a=t.clone().multiplyScalar(r).addScaledVector(n,i);a.lengthSq()>1&&a.normalize();let o=performance.now(),s=$.stance===`crouch`,c=$.stance===`prone`,l=(Kg.has(`ShiftLeft`)||j_)&&a.lengthSq()>0&&F_,u=Yf(r,i,E_,!1,!1);l&&u&&$.stance!==`stand`&&gv(`stand`),u_=l&&!t_&&!$.reloadState&&o>=$.switchingUntil&&o-$.lastMeleeAt>500&&Yf(r,i,E_,s,c);let d=Kf({crouched:s,prone:c,ads:E_,sprinting:u_,grounded:F_}),f=Jf({x:$.velocity.x,z:$.velocity.z},{x:a.x,z:a.z},d,e);$.velocity.x=f.x,$.velocity.z=f.z,$.hp<100&&o-g_>=5e3&&($.hp=Math.min(100,$.hp+18*e)),F_&&(m_=o);let p=o-h_<=125,m=F_||o-m_<=95;p&&m&&!E_&&$.stance===`stand`&&S_.phase===`active`?($.velocity.y=d.jumpVelocity,F_=!1,h_=-1e4):($.velocity.y-=24.5*e,F_&&($.velocity.y=Math.max(0,$.velocity.y)));let h=$.velocity.y,g=U_.move({x:$.velocity.x*e,y:$.velocity.y*e,z:$.velocity.z*e},e);$.position.set(g.position.x,g.position.y,g.position.z),F_=g.grounded,F_&&(m_=o),F_&&!I_&&h<-5&&(o_=Math.min(1,Math.abs(h)/14),Ng.land(Math.abs(h))),I_=F_,g.blockedX&&($.velocity.x=g.appliedDelta.x/Math.max(e,.001)),g.blockedY&&$.velocity.y<0&&($.velocity.y=0),g.blockedZ&&($.velocity.z=g.appliedDelta.z/Math.max(e,.001));let _=a.lengthSq()>0&&F_,v=F_?Math.hypot(g.appliedDelta.x,g.appliedDelta.z):0,y=Vp(__,v,Bp($.stance,u_));__=y.state;for(let e=0;e<y.emitted;e+=1)Ng.footstep(wf($.position),u_,s||c);s_+=e*(u_?15:c?3.6:s?7:10)*(_?1:.25),i_=op(i_,Gf[$.weapon],e),a_=cp(a_,Gf[$.weapon],e),o_=Uf(o_,0,10,e),c_=Uf(c_,0,c?9:15,e);let b=$.velocity.dot(n)/Math.max(1,d.maxSpeed);l_=Uf(l_,-b*(E_?.006:.016),11,e);let x=Q_.update({dt:e,moving:_,sprinting:u_,crouched:s,prone:c,ads:E_,phase:s_,landingImpulse:o_,lateralSpeed:b});for(let e of x)Ng.weaponAction($.weapon,e),Qg.push(e);Qg.length>16&&Qg.splice(0,Qg.length-16),Vg.fov=Uf(Vg.fov,E_?Math.max(55,z_-20):u_?z_+4.5:z_,10,e),Vg.updateProjectionMatrix(),Vg.position.copy($.position),Vg.position.y+=c_-o_*.035,Vg.rotation.y=$.yaw+a_.yaw,Vg.rotation.x=Bt.clamp($.pitch-a_.pitch,-1.42,1.42),Vg.rotation.z=l_}function Wv(e,t){for(let[n,r]of qg){if(t-r.lastSeen>12e3){pv(n,`timed out`);continue}let i=Jh(e),a=r.root.position.distanceTo(r.target);r.root.position.lerp(r.target,i),r.root.rotation.y+=Hf(r.root.rotation.y,r.targetYaw)*i;let o=r.snapshot.stance??`stand`,s=r.root.userData.operator;nf(s,r.snapshot.weapon,Ig),of(s,o,a/Math.max(e,.001),t*.008,i,r.snapshot.pitch)}}function Gv(){let e=$.team===0?$.kills:0,t=$.team===1?$.kills:0;for(let n of qg.values())n.snapshot.team===0?e+=n.snapshot.kills:t+=n.snapshot.kills;for(let n of Jg.values())n.team===0?e+=n.kills:t+=n.kills;return[e,t]}function Kv(e){let t=S_.phase,n=Gv();S_=fp(S_,e,n);let r=xp(S_,e,n,$.team),i=Z(`#countdown`);if(S_.phase===`warmup`?(i.textContent=r.headline??``,i.hidden=!1):i.hidden=!0,t===S_.phase)return;let a=Z(`#banner`);if(S_.phase===`active`){a.innerHTML=`<strong>ENGAGE</strong><span>First squad to 25</span>`,a.hidden=!1,window.setTimeout(()=>{S_.phase===`active`&&(a.hidden=!0)},900);return}S_.phase===`ended`&&(C_=!0,a.innerHTML=`<strong>${r.headline}</strong><span>${r.subline} · ${r.objective}</span><button id="rematch" type="button">REMATCH</button>`,a.hidden=!1,Z(`#rematch`).addEventListener(`click`,()=>{Z_.close(),cy(),vv(`solo`,!1)},{once:!0}),document.exitPointerLock())}function qv(){Kv(performance.now())}function Jv(e){let t=Mg,n=Ag.width,r=Ag.height,i=Q.bounds,a=(e,t)=>hp(e,t,i,n,r);t.clearRect(0,0,n,r),t.fillStyle=`rgba(7, 15, 18, .78)`,t.fillRect(0,0,n,r),t.strokeStyle=`rgba(244, 196, 79, .5)`,t.lineWidth=2,t.strokeRect(2,2,n-4,r-4);let[o]=a(-10.25,0),[s]=a(10.25,0);t.fillStyle=`rgba(126, 137, 132, .18)`,t.fillRect(o,2,s-o,r-4);for(let[e,o,s]of[[-11,-34,0],[11,34,1]]){let[c,l]=a(e,o),u=16.4/(i.maxX-i.minX)*n,d=15/(i.maxZ-i.minZ)*r;t.fillStyle=s===0?`rgba(88, 227, 220, .2)`:`rgba(255, 118, 95, .2)`,t.fillRect(c-u/2,l-d/2,u,d)}for(let e of qg.values()){let n=e.snapshot.team===$.team;if(!n&&e.target.distanceTo($.position)>15)continue;let[r,i]=a(e.target.x,e.target.z);t.fillStyle=n?`#58e3dc`:`#ff765f`,t.beginPath(),t.arc(r,i,3.5,0,Math.PI*2),t.fill()}for(let n of Jg.values()){if(!n.alive||!gp(n.position.distanceTo($.position),e,n.lastShotAt))continue;let[r,i]=a(n.position.x,n.position.z);t.fillStyle=`#ff765f`,t.beginPath(),t.arc(r,i,3.5,0,Math.PI*2),t.fill()}let[c,l]=a($.position.x,$.position.z);t.save(),t.translate(c,l),t.rotate(-$.yaw),t.fillStyle=$.team===0?`#58e3dc`:`#ff765f`,t.beginPath(),t.moveTo(0,-7),t.lineTo(5,6),t.lineTo(-5,6),t.closePath(),t.fill(),t.restore()}function Yv(e){if(e-b_<100)return;b_=e,$g&&Kv(e);let t=Gf[$.weapon],n=Math.hypot($.velocity.x,$.velocity.z),r=E_&&Q_.adsProgress()>=.9,i=ep(t,{ads:r,moving:n>1.2,crouched:$.stance===`crouch`,prone:$.stance===`prone`,sustainedShots:$.sustainedShots}),a=Bt.clamp(5+i*320,5,23),o=Z(`#crosshair`);o.style.setProperty(`--spread`,`${a}px`),o.classList.toggle(`ads`,r);let[s,c]=Gv(),l=[s,c],u=xp(S_,e,l,$.team),d=_p($.position.x,$.position.z);Z(`#location-label`).textContent=vp(d),Ng.setArenaZone(d),Z(`#health`).textContent=String(Math.ceil($.hp)),Z(`#health-fill`).style.width=`${$.hp}%`,Z(`#weapon-name`).textContent=t.name.toUpperCase(),Z(`#ammo`).textContent=String($.ammo[$.weapon]),Z(`#reserve`).textContent=String($.reserve[$.weapon]);let f=Z(`#aqua-score`),p=Z(`#coral-score`);f.textContent=String(s),p.textContent=String(c),l.forEach((e,t)=>{if(e===T_[t])return;let n=t===0?f:p;n.classList.remove(`score-pulse`),requestAnimationFrame(()=>n.classList.add(`score-pulse`))}),T_=l,Z(`#timer`).textContent=u.timer,Z(`#objective`).textContent=u.objective,!$.alive&&w_>0&&(Z(`#respawn-countdown`).textContent=Sp(w_,e)),Z(`#reload-state`).textContent=$.reloadState?`RELOADING ${Math.max(0,($.reloadState.endsAt-e)/1e3).toFixed(1)}s`:e_===`solo`?`${$.kills} K / ${$.deaths} D · ${n_} TARGETS`:`${$.kills} K / ${$.deaths} D`,Z(`#stance`).textContent=$.stance.toUpperCase(),Z(`#grenades`).textContent=`FRAG ×${$.grenades}`,Z(`#health-block`).classList.toggle(`critical`,$.hp<=30),Jv(e),Z(`#roster`).hidden||Xv()}function Xv(){let e=[ov(),...[...qg.values()].map(e=>e.snapshot),...[...Jg.values()].map(e=>({id:e.id,name:e.name,team:e.team,x:e.position.x,y:e.position.y,z:e.position.z,yaw:e.root.rotation.y,pitch:0,hp:e.hp,kills:e.kills,deaths:e.deaths,weapon:`carbine`,seq:0}))].sort((e,t)=>t.kills-e.kills||e.deaths-t.deaths);Z(`#roster-list`).innerHTML=e.map(e=>`<div><span class="${e.team===0?`aqua`:`coral`}">${Zv(e.name)}</span><b>${e.kills}</b><i>${e.deaths}</i><em>${e.hp>0?Math.ceil(e.hp)+` HP`:`DOWN`}</em></div>`).join(``)}function Zv(e){return e.replace(/[&<>'"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,"'":`&#39;`,'"':`&quot;`})[e])}function Qv(){let e=window.innerWidth,t=window.innerHeight;zg.setSize(e,t,!1),Vg.aspect=e/Math.max(1,t),Vg.updateProjectionMatrix()}window.addEventListener(`resize`,Qv),Qv();var $v=new URLSearchParams(window.location.search),ey=$v.get(`room`)?.trim()??``;ey&&(Z(`#room-input`).value=ey);var ty=$v.get(`name`);ty&&(Z(`#player-name`).value=Kh(ty)),$v.get(`team`)===`1`&&(Z(`#team`).value=`1`);var ny=Z(`#sensitivity`),ry=Z(`#controller-sensitivity`),iy=Z(`#field-of-view`),ay=Z(`#graphics-profile`),oy=(e,t,n,r)=>{let i=Number(localStorage.getItem(e));return Number.isFinite(i)&&i>=n&&i<=r?i:t};L_=oy(`atomic-acres-sensitivity`,Number(ny.value),.6,2),R_=oy(`atomic-acres-controller-sensitivity`,Number(ry.value),.5,1.8),z_=oy(`atomic-acres-fov`,Number(iy.value),70,100),ny.value=String(L_),ry.value=String(R_),iy.value=String(z_),ay.value=Pg,ny.addEventListener(`input`,()=>{L_=Number(ny.value),localStorage.setItem(`atomic-acres-sensitivity`,String(L_))}),ry.addEventListener(`input`,()=>{R_=Number(ry.value),localStorage.setItem(`atomic-acres-controller-sensitivity`,String(R_))}),iy.addEventListener(`input`,()=>{z_=Number(iy.value),localStorage.setItem(`atomic-acres-fov`,String(z_))}),ay.addEventListener(`change`,()=>{let e=ay.value;localStorage.setItem(gg,e);let t=new URL(window.location.href);e===`balanced`?t.searchParams.delete(`render`):t.searchParams.set(`render`,e),window.location.assign(t)});function sy(e){let t=navigator.getGamepads?.().find(e=>!!(e&&e.connected));if(!t){k_={x:0,y:0},A_={yaw:0,pitch:0},j_=!1,P_=[],t_=D_,E_=H_??O_;return}let n=Qf(t.axes[0]??0,t.axes[1]??0,.14,1.6),r=Qf(t.axes[2]??0,t.axes[3]??0,.1,1.6),i=t.buttons.map(e=>e.pressed||e.value>.55),a=e=>i[e]&&!P_[e],o=!!i[6]||(t.buttons[6]?.value??0)>.22,s=!!i[7]||(t.buttons[7]?.value??0)>.22,c=W_();s?c||(M_=!1):M_=!0,o?c||(N_=!1):N_=!0;let l=c&&s&&M_,u=c&&o&&N_;j_=c&&!!i[10],E_=H_??(O_||u),t_=D_||l,k_=c?n:{x:0,y:0},A_=$f(A_,c?r:{x:0,y:0},e,E_,R_),c&&($.yaw-=A_.yaw*e,$.pitch=Bt.clamp($.pitch-A_.pitch*e,-1.42,1.42),a(0)&&($.stance!==`stand`&&gv(`stand`),h_=performance.now()),a(1)&&gv(`toggle-crouch`),a(13)&&gv(`toggle-prone`),a(2)&&xv(),a(3)&&bv((bg.indexOf($.weapon)+1)%bg.length),a(4)&&Pv(),a(5)&&Nv()),P_=i}window.addEventListener(`keydown`,e=>{if(W_())Kg.add(e.code);else if(e.code!==`Tab`)return;e.code===`Space`&&!e.repeat&&($.stance!==`stand`&&gv(`stand`),h_=performance.now()),e.code===`KeyC`&&!e.repeat&&gv(`toggle-crouch`),(e.code===`KeyZ`||e.code===`ControlLeft`)&&!e.repeat&&gv(`toggle-prone`),e.code===`Digit1`&&bv(0),e.code===`Digit2`&&bv(1),e.code===`Digit3`&&bv(2),e.code===`KeyR`&&xv(),e.code===`KeyV`&&!e.repeat&&Nv(),e.code===`KeyG`&&!e.repeat&&Pv(),e.code===`Tab`&&(e.preventDefault(),Xv(),Z(`#roster`).hidden=!1)}),window.addEventListener(`keyup`,e=>{Kg.delete(e.code),e.code===`Tab`&&(Z(`#roster`).hidden=!0)}),window.addEventListener(`blur`,()=>{q_()}),window.addEventListener(`mousemove`,e=>{if(document.pointerLockElement!==wg||!$.alive)return;let t=Zf(E_,u_);$.yaw-=e.movementX*.00215*L_*t,$.pitch=Math.max(-1.42,Math.min(1.42,$.pitch-e.movementY*.0019*L_*t)),Q_.addMouseDelta(e.movementX,e.movementY)}),wg.addEventListener(`contextmenu`,e=>e.preventDefault()),wg.addEventListener(`mousedown`,e=>{if(document.pointerLockElement!==wg){hv();return}if(e.button===2){O_=!0,E_=!0;return}e.button===0&&(D_=!0,t_=!0,Cv(performance.now()))}),window.addEventListener(`mouseup`,e=>{e.button===0&&(D_=!1),e.button===2&&(O_=!1),t_=D_,E_=O_}),document.addEventListener(`pointerlockchange`,()=>{document.pointerLockElement===wg?(Z(`#resume`).hidden=!0,Tg.classList.add(`hidden`)):(q_(),$g&&$.alive&&!C_&&(Z(`#resume`).hidden=C_,Tg.classList.remove(`hidden`)))});function cy(){K_(!0),$.kills=0,$.deaths=0,$.hp=100,$.grenades=1,$.reloadState=null,$.sustainedShots=0,$.stance=`stand`,U_?.setStance(`stand`),n_=0,T_=[0,0],w_=0,Dv();for(let e of Yg)Bg.remove(e.mesh);Yg.length=0;for(let e of qg.keys())pv(e,`cleared`);Z(`#banner`).hidden=!0,Z(`#countdown`).hidden=!0,Z(`#respawn`).hidden=!0,$.weapon=Of($_).weapon,$.switchingUntil=0,Q_.setWeapon($.weapon,!0),tv(),$.ammo={carbine:Gf.carbine.mag,smg:Gf.smg.mag,scattergun:Gf.scattergun.mag},$.reserve={carbine:Gf.carbine.reserve,smg:Gf.smg.reserve,scattergun:Gf.scattergun.reserve}}Z(`#resume`).addEventListener(`click`,()=>{$g&&$.alive&&!C_&&hv()}),Z(`#solo`).addEventListener(`click`,()=>{Z_.close(),cy(),vv(`solo`)}),Z(`#host`).addEventListener(`click`,()=>{cy(),Z_.host(()=>{Dg.hidden=!1,Og.textContent=Z_.roomCode,vv(`host`)})}),Z(`#join`).addEventListener(`click`,()=>{cy();let e=Z(`#room-input`).value.trim();Z_.join(e,()=>vv(`client`))}),Z(`#copy-room`).addEventListener(`click`,async()=>{let e=`${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(Z_.roomCode)}`;try{await navigator.clipboard.writeText(e),J_(`Invite link copied`,`ok`)}catch{Z(`#room-input`).value=Z_.roomCode,J_(`Clipboard blocked — code placed in join field`,`warn`)}}),ey&&$v.get(`autojoin`)===`1`&&window.setTimeout(()=>Z(`#join`).click(),100),setInterval(()=>{$g&&Z_.role!==`offline`&&$.alive&&Z_.send({type:`state`,player:ov()})},33),window.addEventListener(`beforeunload`,()=>{Z_.role!==`offline`&&Z_.send({type:`leave`,playerId:$.id}),Z_.close()});function ly(e){try{let t=Math.max(0,e-v_);y_.record(t);let n=y_.summary(),r=Z(`#refresh-warning`);r.hidden=!n.displayLimited,n.displayLimited&&(r.querySelector(`strong`).textContent=`${Math.round(n.cadenceHz)} HZ PRESENTATION LIMIT`);let i=Math.min(.05,t/1e3);v_=e,sy(i),r_+=i;let a=1/120,o=0;for(;r_>=a&&o<6;)Uv(a),r_-=a,o+=1;t_&&Gf[$.weapon].automatic&&Cv(e),Sv(e),Rv(e),Mv(i,e),Iv(i,e),Ug.update(i),Wg.update(i),Wv(i,e),Gg&&Mp(Gg,e),Yv(e),x_||zg.render(Bg,Vg),requestAnimationFrame(ly)}catch(e){Y_(e)}}var uy=window;uy.__ATOMIC_ACRES_DEBUG__={snapshot:()=>({gameStarted:$g,gameMode:e_,matchPhase:S_.phase,matchEndReason:S_.endReason??null,scores:Gv(),player:{hp:$.hp,kills:$.kills,deaths:$.deaths,weapon:$.weapon,ammo:$.ammo[$.weapon],reserve:$.reserve[$.weapon],reloading:$.reloadState!==null,stance:$.stance,crouched:$.stance===`crouch`,prone:$.stance===`prone`,sprinting:u_,grenades:$.grenades,position:$.position.toArray()},bots:[...Jg.values()].map(e=>({id:e.id,hp:e.hp,alive:e.alive,kills:e.kills,position:e.position.toArray(),waypoint:e.waypoint,blockedSince:e.blockedSince,hasLineOfSight:e.hasLineOfSight,presentationReady:[`presentation-reaction-gear`,`field-radio-pack`,`asymmetric-shoulder-plate`,`team-radio-antenna`].every(t=>e.root.getObjectByName(t)!==void 0),presentationWeaponSafe:(()=>{let t=e.root.getObjectByName(`operator-${e.root.userData.operatorRig?.weaponId??`carbine`}`);if(!t)return!1;let n=!0;return t.traverse(e=>{e instanceof U&&e.userData.presentationOnly!==!0&&(n=!1)}),n})()})),remotes:qg.size,networkSync:{stateIntervalMs:33,interpolationRate:24},remotePlayers:[...qg.values()].map(e=>({id:e.snapshot.id,stance:e.snapshot.stance??`stand`,position:e.target.toArray(),visualPosition:e.root.position.toArray(),snapshotAgeMs:Math.max(0,performance.now()-e.lastSeen),interpolationError:e.root.position.distanceTo(e.target)})),grenades:Yg.length,activeImpactParticles:Ug.activeParticles(),activeImpactMarks:Ug.activeMarks(),activeTracers:Wg.activeCount(),originalArtLoaded:Bg.getObjectByName(`original-arena-art`)!==void 0,arenaZone:_p($.position.x,$.position.z),arenaStoryReady:[`route-marker-skyline-garden`,`route-marker-atom-liner-crossing`,`route-marker-solar-service`].every(e=>Bg.getObjectByName(e)!==void 0),weaponReady:Q_.isReady(),weaponPresentation:Q_.presentationState(),weaponActionHistory:[...Qg],menuVisible:!Tg.classList.contains(`hidden`),render:{profile:Pg,representation:Fg.representation,calls:zg.info.render.calls,triangles:zg.info.render.triangles,points:zg.info.render.points,lines:zg.info.render.lines,sceneObjects:Bg.children.length,reducedMode:Ig,shadows:Fg.shadows,shadowMode:Fg.shadowMode,pixelRatio:zg.getPixelRatio(),framePacing:y_.summary(),staticBatchPalette:Bg.getObjectByName(`Atomic Acres arena-render-batches`)?.children.map(e=>{let t=e instanceof U?e.material:null;return!Array.isArray(t)&&t&&`color`in t?t.color.getHexString():null})??[]}}),startSolo:()=>{Z_.close(),cy(),vv(`solo`,!1)},setBotsFrozen:e=>{B_=e},setRenderPaused:e=>{x_=e},openMenu:()=>{q_(),Tg.classList.remove(`hidden`)},fireOnce:()=>{V_=!0,t_=!0,Cv(performance.now()),t_=!1,V_=!1},throwGrenade:()=>Pv(),switchWeapon:e=>bv(e),reload:()=>xv(),melee:()=>Nv(),setAds:e=>{H_=e,E_=e},setStance:e=>{e!==$.stance&&gv(e===`stand`?`stand`:e===`prone`?`toggle-prone`:`toggle-crouch`)},damage:e=>{$.invulnerableUntil=0,dv(e,Jg.keys().next().value??$.id)},endMatch:()=>{$.kills=25,Kv(performance.now())},rematch:()=>{Z_.close(),cy(),vv(`solo`,!1)}};function dy(e,t){let n=new Set;e.traverse(e=>{if(!(e instanceof U)||t.getObjectById(e.id))return;let r=Array.isArray(e.material)?e.material:[e.material];for(let e of r){if(n.has(e)||!(e instanceof W))continue;n.add(e);let{r:t,g:r,b:i}=e.color;Math.max(t,r,i)<.16&&e.color.lerp(new H(5989988),.24)}})}async function fy(){let e=Z(`#solo`),t=Z(`#host`),n=Z(`#join`);e.disabled=!0,t.disabled=!0,n.disabled=!0,J_(`Loading authored arena art, weapons and advanced collision…`);let r=ig.create(Q.colliders,Q.bounds),i=Q_.load((e,t)=>{J_(`Loading authored weapons ${e}/${t}…`)}),a=Pp(Bg,(e,t)=>{J_(`Loading authored arena models ${e}/${t}…`)},Lg),[o,,s]=await Promise.all([r,i,a]);U_=o,Gg=s.root;let c=Q.raycastMeshes.filter(e=>e.visible||e.userData.collisionProxy===!0);Q.raycastMeshes.splice(0,Q.raycastMeshes.length,...c),s.root.traverse(e=>{e instanceof U&&e.userData.blocksShots===!0&&Q.raycastMeshes.push(e)});let l=Bg.getObjectByName(`Atomic Acres arena`);l&&Kd(l,Bg,()=>``,Rg),Kd(s.root,Bg,()=>``,Rg),Fg.shadowMode===`static`&&(zg.shadowMap.needsUpdate=!0),dy(Bg,Q_.root),Q_.setWeapon($.weapon,!0),_v(),Q_.root.visible=!1,Vg.position.set(0,30,-22),Vg.lookAt(0,.8,4),Vg.fov=65,Vg.updateProjectionMatrix(),e.disabled=!1,t.disabled=!X_,n.disabled=!X_,J_(`Pass 12 ready — responsive presentation, synchronized peers and full Quality mode available.`),requestAnimationFrame(ly)}fy().catch(Y_);