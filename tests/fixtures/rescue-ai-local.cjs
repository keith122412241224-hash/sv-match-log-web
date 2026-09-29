const network=global.fetch;
global.fetch=(input,options)=>{
 const url=String(input?.url??input);
 if(url==='https://api.openai.com/v1/responses')return network('http://127.0.0.1:54329/mock-ai',{method:'POST',body:options.body,headers:{'Content-Type':'application/json'}});
 if(/^https?:\/\//.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url))throw Error('External network blocked by rescue test: '+new URL(url).host);
 return network(input,options);
};
