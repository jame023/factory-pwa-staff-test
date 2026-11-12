export const LEAVE_IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
export async function prepareLeavePhoto(file) {
  try {
    if(!LEAVE_IMAGE_TYPES.includes(file.type))throw new Error('รองรับ JPG, PNG และ WebP เท่านั้น');
    if(file.size<1||file.size>20*1024*1024)throw new Error('รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB');
    if(typeof createImageBitmap!=='function')throw new Error('เบราว์เซอร์นี้เตรียมรูปไม่ได้ กรุณาอัปเดตเบราว์เซอร์');
    const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('เปิดรูปไม่ได้ กรุณาเลือกไฟล์รูปที่สมบูรณ์');});
    try {
      if(file.size<=1048576)return {file,compressed:false};
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ');
      let scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),quality=.88;
      for(let i=0;i<10;i++) {
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob?.size>0&&blob.size<=1048576)return {file:new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}),compressed:true};
        if(i%2===0)quality=Math.max(.42,quality-.12);else scale*=.82;
      }
      throw new Error('บีบอัดให้ไม่เกิน 1 MB ไม่ได้ กรุณาเลือกรูปที่เล็กลง');
    }finally{bitmap.close?.();}
  }catch(error){throw new Error(file.name+': '+error.message);}
}
