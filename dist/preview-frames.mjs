import {MAX_THUMBNAIL_CHARS,MAX_GALLERY_CHARS} from './transport-profile.mjs?v=4';
export class PreviewEncoder{
  constructor(){this.canvas=document.createElement('canvas');}
  encode(source,width,height,maxChars=MAX_THUMBNAIL_CHARS){
    const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;if(!sw||!sh)return null;
    // Preserve the camera's aspect ratio so normalized landmark coordinates
    // still align after the host fits this image into a gallery cell.
    const c=this.canvas,scale=Math.min(width/sw,height/sh);c.width=Math.max(1,Math.round(sw*scale));c.height=Math.max(1,Math.round(sh*scale));const ctx=c.getContext('2d');ctx.drawImage(source,0,0,c.width,c.height);
    for(const quality of [.55,.36,.22,.12]){const jpeg=c.toDataURL('image/jpeg',quality);if(jpeg.length<=maxChars)return jpeg;}
    return null; // Never queue an oversized image ahead of time-critical scoring.
  }
  gallery(source){return this.encode(source,960,540,MAX_GALLERY_CHARS);}
}
