export const MAX_PLAYERS=30;
// Above eight players, keep one data connection per participant and exchange
// bounded JPEG previews instead of running 60 video peer connections.
export function transportProfile(count){return count>8?{mode:'preview',snapshotInterval:1000,galleryInterval:1000,previewWidth:240,previewHeight:180,stateInterval:300}:{mode:'video',snapshotInterval:500,galleryInterval:500,previewWidth:320,previewHeight:240,stateInterval:200};}
export const MAX_THUMBNAIL_CHARS=18000;
export const MAX_GALLERY_CHARS=48000;
export function validJPEG(data,max=MAX_THUMBNAIL_CHARS){return typeof data==='string'&&data.length<=max&&data.length>=50&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data);}
export function sendPreview(connection,message){if(!connection?.open||connection.dataChannel?.bufferedAmount>16384)return false;try{connection.send(message);return true;}catch{return false;}}
export function compactState(state){const {rounds,extra,...rest}=state;return rest;}
