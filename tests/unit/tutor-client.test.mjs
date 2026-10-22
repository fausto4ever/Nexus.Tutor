import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function client(reply = { ok: true }) {
  const sent = [];
  const window = {
    APP_INSTANCE: { GATEWAY_URL: 'https://qa.test/' },
    fetch: async (url, opt = {}) => {
      sent.push({ url: String(url), ...opt });
      return Response.json(reply);
    }
  };
  vm.runInNewContext(read('services/gateway-client.js'), { window, URL, Error });
  return { api: window.GatewayClient, sent };
}

test('Tutor: crea PR de varios alumnos sin inventar un requestId comun', async () => {
  const { api, sent } = client({ok:true,results:[{studentId:'S1',result:'CREATED'},{studentId:'S2',result:'CREATED'}]});
  const results=await api.createPickupRequests({tutorId:'T1',studentIds:['S1','S2'],mode:'GPS',distanceMeters:80});
  assert.equal(results.results.length,2);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests');
  assert.deepEqual(JSON.parse(sent[0].body).studentIds,['S1','S2']);
});

test('Tutor: no solicita PR si no hay alumnos y no hace red', async () => {
  const {api,sent}=client();
  await assert.rejects(api.createPickupRequests({tutorId:'T1',studentIds:[],mode:'GPS'}),/studentIds/);
  assert.equal(sent.length,0);
});

test('Tutor: consulta estados y GPS con IDs de PR separados', async () => {
  const {api,sent}=client();
  await api.pickupStatus('T1',['R1','R2']);
  await api.updatePickupGps('T1',['R1','R2'],35);
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests/status');
  assert.equal(sent[1].url,'https://qa.test/api/pickup-requests/gps');
  assert.deepEqual(JSON.parse(sent[0].body).requestIds,['R1','R2']);
  assert.equal(JSON.parse(sent[1].body).distanceMeters,35);
});

test('Tutor: propaga errores de autorizacion sin declararlos como exito', async () => {
  const {api}=client({ok:false,error:'NOT_AUTHORIZED'});
  await assert.rejects(api.createPickupRequests({tutorId:'T1',studentIds:['S1'],mode:'ETA',etaMinutes:5}),
    e=>e.code==='NOT_AUTHORIZED');
});

test('Tutor: contrato de tiempo elimina timestamps de lifecycle enviados por el cliente', async () => {
  const calls=[];
  const window={
    TUTOR_EXPERIENCE_CONFIG: {locale:'es-MX',timeZone:'America/Mexico_City'},
    fetch: async (url,opt={})=>{calls.push({url,opt});return Response.json({ok:true});}
  };
  vm.runInNewContext(read('pickup-time-contract.js'),{window,Intl,Date,console,Set});
  assert.equal(window.NexusPickupTime.isUtcZ('2026-10-20T18:00:00Z'),true);
  assert.equal(window.NexusPickupTime.isUtcZ('2026-10-20T12:00:00-06:00'),false);
  await window.fetch('https://qa.test/api/pickup-requests',{method:'POST',
    body:JSON.stringify({studentIds:['S1'],requestedAt:'2020-01-01T00:00:00Z',distanceMeters:70})});
  const body=JSON.parse(calls[0].opt.body);
  assert.equal(body.requestedAt,undefined);
  assert.equal(body.distanceMeters,70);
});

test('Tutor 0.26: cancelacion envia requestId en JSON y nunca en la ruta', async () => {
  const {api,sent}=client();
  await api.cancelPickupRequest('REQ-001');
  assert.equal(sent.length,1);
  assert.equal(sent[0].method,'POST');
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests/cancel');
  assert.equal(JSON.parse(sent[0].body).requestId,'REQ-001');
});

test('Tutor 0.26: cancelacion sin requestId falla antes de hacer red', async () => {
  const {api,sent}=client();
  await assert.rejects(api.cancelPickupRequest('  '),/requestId requerido/);
  assert.equal(sent.length,0);
});

test('Tutor 0.26: reintento de cancelacion conserva requestId y ruta', async () => {
  const {api,sent}=client();
  await api.cancelPickupRequest('REQ-002');
  await api.cancelPickupRequest('REQ-002');
  assert.equal(sent.length,2);
  for (const call of sent) {
    assert.equal(new URL(call.url).pathname,'/api/pickup-requests/cancel');
    assert.equal(JSON.parse(call.body).requestId,'REQ-002');
  }
});

test('Tutor 0.26: consulta de tutor conserva GET con identificador codificado', async () => {
  const {api,sent}=client();
  await api.tutor('T/1');
  assert.equal(sent[0].url,'https://qa.test/api/tutors/T%2F1');
  assert.equal(sent[0].method,undefined);
});

test('Tutor 0.26: fallo de Gateway en cancelacion no se declara exitoso', async () => {
  const {api}=client({ok:false,error:'REQUEST_NOT_FOUND'});
  await assert.rejects(api.cancelPickupRequest('REQ-404'),e=>e.code==='REQUEST_NOT_FOUND');
});

test('Tutor: health consulta la ruta de version configurada sin cache',async()=>{
  const {api,sent}=client({ok:true,version:'0.26.0'});
  const response=await api.get('health');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://qa.test/api/version');
  assert.equal(sent[0].cache,'no-store');
  assert.equal(response.version,'0.26.0');
});

test('Tutor: health no acepta como exito un error del Gateway',async()=>{
  const {api}=client({ok:false,error:'UNAVAILABLE'});
  await assert.rejects(api.get('health'),e=>e.code==='UNAVAILABLE');
});

test('Tutor: exige Gateway 0.26.0 en el endpoint publico de version',async()=>{
  const {api,sent}=client({ok:true,gateway:{version:'0.26.0'},backend:{apiVersion:'2.9.1'}});
  const result=await api.assertGatewayVersion();
  assert.equal(result.gateway.version,'0.26.0');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://qa.test/api/gateway/version');
  assert.equal(sent[0].cache,'no-store');
});

test('Tutor: detecta Gateway desplegado con version incompatible',async()=>{
  const {api}=client({ok:true,gateway:{version:'0.25.0'}});
  await assert.rejects(api.assertGatewayVersion(),e=>
    e.code==='GATEWAY_VERSION_MISMATCH'&&e.expectedVersion==='0.26.0'&&e.actualVersion==='0.25.0');
});

test('Tutor: no acepta respuesta de version sin version',async()=>{
  const {api}=client({ok:true});
  await assert.rejects(api.assertGatewayVersion(),e=>e.code==='GATEWAY_VERSION_MISMATCH');
});

test('Tutor GPS: cancelar solicitud activa usa exclusivamente contrato JSON 0.26, nunca legacy',async()=>{
  const sent=[];
  const window={
    APP_INSTANCE:{GATEWAY_URL:'https://qa.test/'},
    fetch:async(url,opt={})=>{
      const call={url:String(url),...opt};
      sent.push(call);
      if(call.url.endsWith('/api/pickup-requests'))return Response.json({ok:true,results:[{studentId:'S1',requestId:'GPS-123',result:'CREATED'}]});
      if(call.url.endsWith('/api/pickup-requests/cancel'))return Response.json({ok:true,requestId:'GPS-123',status:'CANCELLED'});
      throw new Error('Ruta inesperada: '+call.url);
    }
  };
  vm.runInNewContext(read('services/gateway-client.js'),{window,URL,Error});
  const api=window.GatewayClient;
  const created=await api.createPickupRequests({tutorId:'T1',studentIds:['S1'],mode:'GPS',distanceMeters:450});
  const requestId=created.results[0].requestId;
  const cancelled=await api.cancelPickupRequest(requestId);
  assert.equal(cancelled.status,'CANCELLED');
  assert.equal(sent.length,2,'Solo crear y cancelar; sin rutas duplicadas');
  assert.equal(sent[0].method,'POST');
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests');
  assert.equal(JSON.parse(sent[0].body).mode,'GPS');
  assert.equal(sent[1].method,'POST');
  assert.equal(sent[1].url,'https://qa.test/api/pickup-requests/cancel');
  assert.deepEqual(JSON.parse(sent[1].body),{requestId:'GPS-123'});
  assert.equal(sent.some(call=>/\/api\/pickup-requests\/[^/]+\/cancel(?:\?|$)/.test(new URL(call.url).pathname)),false,
    'La ruta legacy /api/pickup-requests/{requestId}/cancel queda prohibida');
});

test('Tutor GPS: cancelacion fallida no se considera CANCELLED ni recurre al endpoint legacy',async()=>{
  const sent=[];
  const window={
    APP_INSTANCE:{GATEWAY_URL:'https://qa.test/'},
    fetch:async(url,opt={})=>{
      sent.push({url:String(url),...opt});
      return Response.json({ok:false,error:'TEMPORARY_FAILURE'});
    }
  };
  vm.runInNewContext(read('services/gateway-client.js'),{window,URL,Error});
  await assert.rejects(window.GatewayClient.cancelPickupRequest('GPS-123'),e=>e.code==='TEMPORARY_FAILURE');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://qa.test/api/pickup-requests/cancel');
});
