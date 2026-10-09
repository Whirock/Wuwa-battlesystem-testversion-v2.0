/* Local-only persistence. No network calls. IndexedDB failures are explicit. */
(function(root){'use strict';
class LocalProjectStore {
 constructor(){this.db=null;this.available=false;this.error='';this.memory=new Map();}
 async init(){try{this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('resonant-encounter-lab-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('本地数据库被其他窗口占用'));});this.available=true;}catch(e){this.error=e.message||String(e);}return this;}
 async get(key){if(!this.db)return this.memory.get(key);return new Promise((resolve,reject)=>{const tx=this.db.transaction('records','readonly');const r=tx.objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async set(key,value){this.memory.set(key,value);if(!this.db)return false;await new Promise((resolve,reject)=>{const tx=this.db.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存中止'));});return true;}
 async remove(key){this.memory.delete(key);if(!this.db)return;await new Promise((resolve,reject)=>{const tx=this.db.transaction('records','readwrite');tx.objectStore('records').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
 async clear(){this.memory.clear();if(!this.db)return;await new Promise((resolve,reject)=>{const tx=this.db.transaction('records','readwrite');tx.objectStore('records').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
}
root.LocalProjectStore=LocalProjectStore;
})(typeof window!=='undefined'?window:globalThis);
