/* eslint-disable @typescript-eslint/no-require-imports */
// Test process instrumentation: real Supabase traffic, deterministic AI text only.
const fs=require('node:fs'),network=global.fetch;
global.fetch=async(input,options)=>{
 const url=String(input?.url??input);
 if(url==='https://api.openai.com/v1/responses'){
  fs.appendFileSync(process.env.PERIOD_REAL_TRACE,JSON.stringify({kind:'ai-input',body:JSON.parse(options.body)})+'\n');
  return new Response(JSON.stringify({output_text:'# 隔離検証用本文'}),{headers:{'Content-Type':'application/json'}});
 }
 if(/^https?:/.test(url)&&new URL(url).origin!=='http://127.0.0.1:59321')throw Error('Test blocked unexpected network destination');
 const result=await network(input,options);
 if(url.includes('/rest/v1/rpc/'))fs.appendFileSync(process.env.PERIOD_REAL_TRACE,JSON.stringify({kind:'rpc',path:new URL(url).pathname,args:options?.body?JSON.parse(options.body):null,status:result.status})+'\n');
 return result;
};
