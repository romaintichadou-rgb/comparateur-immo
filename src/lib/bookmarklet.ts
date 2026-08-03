/**
 * Bookmarklet "Importer dans Immoscore". S'exécute dans le
 * navigateur de l'utilisateur, sur une page d'annonce déjà chargée
 * normalement (aucune requête automatisée vers le site source) : il lit les
 * données déjà présentes dans le DOM/JSON embarqué et les transmet à l'app
 * via un paramètre d'URL. Aucune détection anti-bot possible côté site
 * source puisqu'il n'y a pas de scraping, juste une lecture locale d'une
 * page consultée normalement par un humain.
 *
 * Pipeline d'extraction par priorité :
 *   1. JSON-LD (schema.org) — cross-plateforme, données structurées fiables
 *   2. __NEXT_DATA__ — spécifique Leboncoin (Next.js)
 *   3. Sélecteurs CSS plateforme — ciblés par site
 *   4. URL parsing — ville, quartier, code postal depuis le chemin
 *   5. og:description parsing — prix, ville, code postal depuis la méta
 *   6. Free-text regex — dernier filet sur body.innerText
 *
 * Chaque couche ne remplit que les champs encore vides — la première source
 * fiable gagne, pas la plus grosse valeur.
 *
 * Avant d'extraire, déplie tout ce qui peut masquer de l'information :
 * boutons/liens "Voir plus / En savoir plus / Voir la description...",
 * boutons "Voir le numéro", accordéons `aria-expanded="false"`, et blocs
 * `<details>` natifs. Fait jusqu'à 5 passes successives.
 *
 * Le code est volontairement écrit en ES5/syntaxe permissive pour rester
 * exécutable tel quel sur un maximum de pages tierces sans étape de build.
 *
 * ── TROIS RÈGLES À NE PAS OUBLIER EN ÉDITANT CETTE CHAÎNE ────────────────
 *
 * 1. **Aucun commentaire `//` ici.** `buildBookmarkletHref` supprime TOUS les
 *    sauts de ligne : le script devient une seule ligne, et un `//` avale donc
 *    tout ce qui suit. Le bookmarklet ne fait alors plus rien du tout, sans la
 *    moindre erreur en console. Utiliser une expression de commentaire de bloc
 *    si c'est indispensable, sinon documenter ICI, dans l'en-tête TypeScript.
 *
 * 2. **Un seul `__APP_ORIGIN__`.** La substitution est un `String.replace`
 *    sans `/g` : seule la PREMIÈRE occurrence est remplacée, les suivantes
 *    resteraient littérales dans l'URL produite.
 *
 * 3. **Pas de `fetch()` vers notre API.** Le script s'exécute sur le domaine
 *    de l'annonce ; un appel vers l'app est cross-origin et se fait bloquer
 *    par CORS. Vérifier la session ici est de toute façon inutile : le proxy
 *    redirige déjà `/appartements/nouveau?prefill=…` vers
 *    `/login?suivant=…`, en conservant la query string — l'annonce n'est donc
 *    pas perdue, et l'utilisateur y revient après connexion.
 *
 * Ces trois points ont été violés d'un coup par une seule modification (lot
 * 4, « bookmarklet avec vérification de session ») : le bookmarklet est resté
 * silencieusement mort jusqu'au test manuel suivant.
 */
const BOOKMARKLET_SOURCE = `(function(){
var w=window.open('about:blank','_blank');
function expandVoir(cb){
var re=/\\b(voir|en savoir plus|afficher plus|voir plus|voir tout|voir la description|voir les d[eé]tails|d[eé]tails|tout afficher|lire la suite|num[eé]ro|d[eé]plier|montrer|plus d'infos?)\\b/i;
function pass(){
var n=0;
var els=document.querySelectorAll('button, [role="button"], a, summary, [aria-expanded="false"]');
for(var i=0;i<els.length;i++){
var el=els[i];
if(el.getAttribute&&el.getAttribute('data-blm-done'))continue;
if(el.tagName==='SUMMARY'){
try{if(el.parentElement&&el.parentElement.tagName==='DETAILS'&&!el.parentElement.open){el.parentElement.open=true;el.setAttribute('data-blm-done','1');n++;}}catch(e){}
continue;
}
if(el.tagName==='A'){
var href=el.getAttribute('href');
if(href&&href.indexOf('tel:')===0)continue;
if(href&&href!=='#'&&href.indexOf('javascript:')!==0)continue;
}
var expanded=el.getAttribute&&el.getAttribute('aria-expanded');
var t=(el.textContent||'').trim();
if((expanded==='false')||(t.length<40&&re.test(t))){try{el.click();el.setAttribute&&el.setAttribute('data-blm-done','1');n++;}catch(e){}}
}
return n;
}
var rounds=0;
function loop(){
rounds++;
var clicked=pass();
if(clicked>0&&rounds<5)setTimeout(loop,600);
else setTimeout(cb,clicked>0?600:0);
}
loop();
}
function go(){
function T(s){var e=document.querySelector(s);return e?(e.getAttribute('content')||e.textContent):null;}
function N(v){if(v==null)return undefined;var s=String(v).replace(/[^\\d,.\\-]/g,'');s=s.replace(/\\.(\\d{3})(?=[.,]|$)/g,'$1');s=s.replace(',','.');var n=parseFloat(s);return isNaN(n)?undefined:n;}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}
var d={};
var h=location.hostname.replace('www.','');
var pf='Manuel';
if(h.indexOf('leboncoin.fr')>-1)pf='Leboncoin';
else if(h.indexOf('seloger.com')>-1)pf='SeLoger';
else if(h.indexOf('pap.fr')>-1)pf='PAP';
else if(h.indexOf('orpi.com')>-1)pf='Orpi';
else if(h.indexOf('bienici.com')>-1)pf='BienIci';
else if(h.indexOf('logic-immo.com')>-1)pf='LogicImmo';
else if(h.indexOf('lux-residence.com')>-1)pf='LuxResidence';
else if(h.indexOf('century21.fr')>-1)pf='Century21';
else if(h.indexOf('laforet.com')>-1)pf='Laforet';
else if(h.indexOf('avendrealouer.fr')>-1)pf='AVendreALouer';
else if(h.indexOf('immobilier.notaires.fr')>-1||h.indexOf('notaires.fr')>-1)pf='Notaires';
else if(h.indexOf('bemove.fr')>-1||h.indexOf('immo9.com')>-1||h.indexOf('esprit-sud-est.com')>-1||h.indexOf('monmarcheimmobilier.com')>-1||h.indexOf('licitor.com')>-1||h.indexOf('interencheres.com')>-1||h.indexOf('residences-immobilier.com')>-1||h.indexOf('homadeus.com')>-1)pf='Autre';
var od=T('meta[property="og:description"]')||T('meta[name="description"]');
if(od)d.description=od.trim();
var ot=T('meta[property="og:title"]')||document.title||'';
if(ot){
if(!d.nb_pieces){var otp=ot.match(/(\\d+)\\s?pi[eè]ces?/i);if(otp)d.nb_pieces=N(otp[1]);}
if(!d.surface_m2){var ots=ot.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(ots)d.surface_m2=N(ots[1]);}
if(!d.prix){var otpr=ot.match(/(\\d[\\d\\s]{4,9})\\s*€/);if(otpr){var otpv=N(otpr[1]);if(otpv&&otpv>=10000)d.prix=otpv;}}
if(!d.code_postal){var otcp=ot.match(/\\b(\\d{5})\\b/);if(otcp)d.code_postal=otcp[1];}
}
var oi=T('meta[property="og:image"]');if(oi)d.photo_url=oi;
try{
var scripts=document.querySelectorAll('script[type="application/ld+json"]');
for(var i=0;i<scripts.length;i++){
try{
var j=JSON.parse(scripts[i].textContent);
var items=Array.isArray(j)?j:(j['@graph']?j['@graph']:[j]);
for(var k=0;k<items.length;k++){
var it=items[k];
if(!it||typeof it!=='object')continue;
var pr=it.offers?(N(it.offers.price)||N(it.offers.lowPrice)||(it.offers.priceSpecification?N(it.offers.priceSpecification.price):undefined)):N(it.price);
if(pr&&pr>=1000&&!d.prix)d.prix=pr;
var addr=it.address;
if(addr&&typeof addr==='object'){
if(addr.addressLocality&&!d.ville)d.ville=addr.addressLocality;
if(addr.postalCode&&!d.code_postal)d.code_postal=String(addr.postalCode);
if(addr.streetAddress&&!d.adresse)d.adresse=addr.streetAddress;
}
if(it.floorSize&&it.floorSize.value&&!d.surface_m2)d.surface_m2=N(it.floorSize.value);
if(it.numberOfRooms&&!d.nb_pieces)d.nb_pieces=N(it.numberOfRooms);
if(it.numberOfBedrooms&&!d.nb_chambres)d.nb_chambres=N(it.numberOfBedrooms);
var io=it.itemOffered;
if(io&&typeof io==='object'){
if(io.floorSize&&io.floorSize.value&&!d.surface_m2)d.surface_m2=N(io.floorSize.value);
if(io.numberOfRooms&&!d.nb_pieces)d.nb_pieces=N(io.numberOfRooms);
if(io.numberOfBedrooms&&!d.nb_chambres)d.nb_chambres=N(io.numberOfBedrooms);
}
var ap=it.additionalProperty;
if(ap&&Array.isArray(ap)){for(var ai=0;ai<ap.length;ai++){var p=ap[ai];if(!p||!p.name)continue;var pn=p.name.toLowerCase();
if(pn.indexOf('surface')>-1&&!d.surface_m2){var sv=N(p.value);if(sv)d.surface_m2=sv;}
if(pn.indexOf('pi')>-1&&pn.indexOf('ce')>-1&&!d.nb_pieces){var pv2=N(p.value);if(pv2)d.nb_pieces=pv2;}
if(pn.indexOf('chambre')>-1&&!d.nb_chambres){var cv=N(p.value);if(cv)d.nb_chambres=cv;}
if(pn.indexOf('ascenseur')>-1&&d.ascenseur===undefined)d.ascenseur=(String(p.value).toLowerCase()==='oui'||p.value===true||p.value==='1');
if((pn.indexOf('ann')>-1&&pn.indexOf('construction')>-1||pn==='année de construction')&&!d.annee_construction){var yv=N(p.value);if(yv&&yv>=1800&&yv<=2030)d.annee_construction=yv;}
if((pn.indexOf('taxe')>-1&&pn.indexOf('fonci')>-1)&&!d.taxe_fonciere){var tfv2=N(p.value);if(tfv2&&tfv2>=100&&tfv2<=10000)d.taxe_fonciere=tfv2;}
if((pn.indexOf('étage')>-1||pn.indexOf('etage')>-1)&&pn.indexOf('nombre')===- 1&&!d.etage){var ev=String(p.value).trim();if(/^\\d+$/.test(ev))d.etage=ev;else if(/rdc|rez/i.test(ev))d.etage='RDC';}
}}
if(it.yearBuilt&&!d.annee_construction){var yb=N(it.yearBuilt);if(yb&&yb>=1800&&yb<=2030)d.annee_construction=yb;}
if(it.itemCondition&&!d.etat_bien){var ic=String(it.itemCondition).toLowerCase();if(ic.indexOf('new')>-1)d.etat_bien='Neuf';else if(ic.indexOf('used')>-1||ic.indexOf('refurbished')>-1)d.etat_bien='Bon état';}
if(it.image&&!d.photo_url){
var img=Array.isArray(it.image)?it.image[0]:it.image;
if(typeof img==='string')d.photo_url=img;
else if(img&&img.url)d.photo_url=img.url;
}
}
}catch(e){}
}
}catch(e){}
try{
var el=document.querySelector('#__NEXT_DATA__');
if(el){
var j=JSON.parse(el.textContent);
var ad=j&&j.props&&j.props.pageProps&&j.props.pageProps.ad;
if(ad){
if(ad.body)d.description=ad.body;
var pr=N(Array.isArray(ad.price)?ad.price[0]:ad.price);if(pr&&!d.prix)d.prix=pr;
if(ad.location){
if(ad.location.city&&!d.ville)d.ville=ad.location.city;
if(ad.location.zipcode&&!d.code_postal)d.code_postal=ad.location.zipcode;
if(ad.location.district&&!d.quartier)d.quartier=ad.location.district;
}
var at=ad.attributes||[];
function A(k){for(var i=0;i<at.length;i++)if(at[i].key===k)return at[i];return null;}
var a;
if((a=A('square'))&&N(a.value)&&!d.surface_m2)d.surface_m2=N(a.value);
if((a=A('rooms'))&&N(a.value)&&!d.nb_pieces)d.nb_pieces=N(a.value);
if((a=A('bedrooms'))&&N(a.value)&&!d.nb_chambres)d.nb_chambres=N(a.value);
if((a=A('floor'))&&a.value&&!d.etage)d.etage=a.value;
if((a=A('elevator'))&&a.value&&d.ascenseur===undefined)d.ascenseur=(a.value==='1'||a.value==='true');
if((a=A('energy_rate'))&&!d.dpe)d.dpe=a.value_label||a.value;
if((a=A('ghg'))&&!d.ges)d.ges=a.value_label||a.value;
if(!d.charges_copro_annuelles){for(var ci2=0;ci2<at.length;ci2++){var ck=at[ci2].key;if(/charge|copro|condo|fee/i.test(ck)&&!/energy|facture/i.test(ck)){var ckv=N(at[ci2].value_label||at[ci2].value);if(ckv&&ckv>=100&&ckv<=20000){d.charges_copro_annuelles=ckv;break;}}}}
if(!d.annee_construction){a=A('construction_year')||A('year_of_construction');if(a){var cyv=N(a.value_label||a.value);if(cyv&&cyv>=1800&&cyv<=2030)d.annee_construction=cyv;}}
if(!d.etat_bien){a=A('real_estate_condition')||A('condition');if(a){var ecl=(a.value_label||'').toLowerCase();if(/tr[eè]s\\s+bon/i.test(ecl)||/excellent/i.test(ecl))d.etat_bien='Bon état';else if(/bon\\s+[eé]tat/i.test(ecl))d.etat_bien='Bon état';else if(/[aà]\\s+r[eé]nover/i.test(ecl))d.etat_bien='À rénover';else if(/[aà]\\s+rafra[iî]chir/i.test(ecl))d.etat_bien='À rafraîchir';else if(/neuf/i.test(ecl))d.etat_bien='Neuf';}}
if(!d.taxe_fonciere){a=A('property_tax')||A('land_tax');if(a&&N(a.value)){var lbtf=N(a.value);if(lbtf&&lbtf>=100&&lbtf<=10000)d.taxe_fonciere=lbtf;}}
var im=(ad.images&&ad.images.urls)||[];if(im[0]&&!d.photo_url)d.photo_url=im[0];
}
}
}catch(e){}
if(pf==='Leboncoin'&&!d.charges_copro_annuelles){try{var bt=document.body.innerText||'';var ccm=bt.match(/charges?\\s+annuelles?\\s+(?:de\\s+)?copropri[eé]t[eé]\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(ccm){var ccv2=N(ccm[1]);if(ccv2&&ccv2>=100&&ccv2<=20000)d.charges_copro_annuelles=ccv2;}}catch(e){}}
if(pf==='SeLoger'||pf==='LogicImmo'){
try{
var sels=['[data-test="sl.price"]','[data-testid="price"]','[class*="Price_price"]','[class*="Summary_price"]','[class*="price--"]'];
if(!d.prix){for(var i=0;i<sels.length;i++){var pe=document.querySelector(sels[i]);if(pe){var pv=N(pe.textContent);if(pv&&pv>=10000){d.prix=pv;break;}}}}
if(!d.dpe||!d.ges){
var certEl=document.querySelector('[data-testid="cdp-energy-certificate-preview"],[data-testid="cdp-energy"]');
if(certEl){var ct=certEl.textContent||'';
if(!d.dpe){var dm0=ct.match(/\\(DPE\\)\\s*([A-G])/i);if(dm0)d.dpe=dm0[1].toUpperCase();}
if(!d.ges){var gm0=ct.match(/\\(GES\\)\\s*([A-G])/i);if(gm0)d.ges=gm0[1].toUpperCase();}
}
var diagEls=document.querySelectorAll('[class*="dpe"],[class*="Dpe"],[class*="energy"],[class*="Energy"],[data-testid*="dpe"],[data-testid*="energy"],[class*="diagnostic"]');
for(var i=0;i<diagEls.length;i++){
var txt=(diagEls[i].textContent||'')+(diagEls[i].getAttribute('aria-label')||'');
if(!d.dpe){var dm=txt.match(/\\(DPE\\)\\s*([A-G])/i)||txt.match(/(?:DPE|[ÉE]nergie|Consommation)[^A-G]{0,30}\\b([A-G])\\b/i);if(dm)d.dpe=dm[1].toUpperCase();}
if(!d.ges){var gm=txt.match(/\\(GES\\)\\s*([A-G])/i)||txt.match(/(?:GES|[Gg]az|[Cc]limat|[ÉE]mission)[^A-G]{0,30}\\b([A-G])\\b/i);if(gm)d.ges=gm[1].toUpperCase();}
}
if(!d.dpe||!d.ges){var allDiag=document.body.innerText||'';
if(!d.dpe){var dm2=allDiag.match(/\\(DPE\\)\\s*([A-G])/i)||allDiag.match(/[Cc]onsommation[^A-G]{0,40}classe\\s+([A-G])\\b/i);if(dm2)d.dpe=dm2[1].toUpperCase();}
if(!d.ges){var gm2=allDiag.match(/\\(GES\\)\\s*([A-G])/i)||allDiag.match(/[ÉéEe]missions?[^A-G]{0,40}classe\\s+([A-G])\\b/i);if(gm2)d.ges=gm2[1].toUpperCase();}
}
}
if(od){if(!d.surface_m2){var sog=od.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(sog)d.surface_m2=N(sog[1]);}if(!d.nb_pieces){var tog=od.match(/\\b[TF](\\d+)\\b/);if(tog)d.nb_pieces=N(tog[1]);}}
if(!d.surface_m2||!d.nb_pieces||!d.etage){
var feats=document.querySelectorAll('[class*="feature"],[class*="Feature"],[class*="detail"],[class*="Detail"],[class*="criterion"],[class*="Criterion"],[class*="tag"],[class*="floor"],[class*="Floor"],[data-testid*="floor"],[class*="Summary"]');
for(var i=0;i<feats.length;i++){
var ft=(feats[i].textContent||'').trim();
if(!d.surface_m2){var sm=ft.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(sm)d.surface_m2=N(sm[1]);}
if(!d.nb_pieces){var pm=ft.match(/(\\d+)\\s?pi[eè]ces?/i);if(pm)d.nb_pieces=N(pm[1]);}
if(!d.etage){var em=ft.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage(?!s)|t\\.)/i)||ft.match(/[eé](?:tage(?!s)|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(em)d.etage=em[1];}
if(!d.etage&&/rez[\\s-]?de[\\s-]?chauss/i.test(ft))d.etage='RDC';
}
}
var etEl=document.querySelector('[data-testid="cdp-energy-features"],[class*="energy-features"],[class*="EnergyFeatures"]');
if(etEl){var ett=(etEl.textContent||'');
if(!d.etat_bien){if(/\\bneuf\\b/i.test(ett))d.etat_bien='Neuf';else if(/\\b(?:r[eé]nov|refait|r[eé]habilit|entretenu)/i.test(ett))d.etat_bien='Bon état';else if(/\\b[aà]\\s+r[eé]nover\\b/i.test(ett))d.etat_bien='À rénover';else if(/\\b[aà]\\s+rafra[iî]chir\\b/i.test(ett))d.etat_bien='À rafraîchir';}
if(!d.annee_construction){var acm=ett.match(/ann[eé]e\\s+de\\s+construction\\s*(\\d{4})/i)||ett.match(/construit\\w*\\s+en\\s+(\\d{4})/i);if(acm)d.annee_construction=N(acm[1]);}
}
var featSec=document.querySelector('[data-testid="cdp-features"]');
if(featSec){var flis=featSec.querySelectorAll('li');for(var fi=0;fi<flis.length;fi++){var flt=(flis[fi].textContent||'').trim();
if(!d.nb_chambres){var fcm=flt.match(/(\\d+)\\s?chambres?/i);if(fcm)d.nb_chambres=N(fcm[1]);}
if(d.ascenseur===undefined){if(/\\bascenseur\\b/i.test(flt)){d.ascenseur=!/\\b(?:pas|sans)\\b/i.test(flt);}}
if(!d.etage){var fem=flt.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage(?!s)|t\\.)/i)||flt.match(/[eé](?:tage(?!s)|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(fem)d.etage=fem[1];}
if(!d.etage&&/rez[\\s-]?de[\\s-]?chauss/i.test(flt))d.etage='RDC';
}}
var coOwn=document.querySelector('[data-testid="cdp-co-ownership"],[data-testid="cdp-price"]');
if(coOwn&&!d.charges_copro_annuelles){var cot=coOwn.textContent||'';var chm=cot.match(/charges?\\s+(?:de\\s+)?copropri[eé]t[eé]\\s*(\\d[\\d\\s]*)\\s*€/i);if(chm){var chv=N(chm[1]);if(chv)d.charges_copro_annuelles=chv;}}
}catch(e){}
}
if(pf==='BienIci'){
try{
if(!d.dpe){var dpeEl=document.querySelector('.dpe-line__classification,[class*="dpe-line"] [class*="classification"]');if(dpeEl){var dl=(dpeEl.textContent||'').trim();if(/^[A-G]$/i.test(dl))d.dpe=dl.toUpperCase();}}
if(!d.ges){var gesEl=document.querySelector('.ges-line__classification,[class*="ges-line"] [class*="classification"]');if(gesEl){var gl=(gesEl.textContent||'').trim();if(/^[A-G]$/i.test(gl))d.ges=gl.toUpperCase();}}
if(!d.description){var descBI=document.querySelector('[class*="see-more-description"]');if(descBI){var dbt=(descBI.textContent||'').trim();if(dbt.length>80)d.description=dbt;}}
var biLabels=document.querySelectorAll('.allDetails .labelInfo');
for(var bi=0;bi<biLabels.length;bi++){var blt=(biLabels[bi].textContent||'').trim();
if(!d.nb_chambres){var bcm=blt.match(/(\\d+)\\s?chambres?/i);if(bcm)d.nb_chambres=N(bcm[1]);}
if(!d.etage){var bem=blt.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé]tage/i);if(bem)d.etage=bem[1];else if(/dernier\\s+[eé]tage/i.test(blt))d.etage='Dernier';else if(/rez[\\s-]?de[\\s-]?chauss/i.test(blt))d.etage='RDC';}
if(d.ascenseur===undefined&&/^\\s*ascenseur\\s*$/i.test(blt))d.ascenseur=true;
if(!d.annee_construction){var bam=blt.match(/construit\\w*\\s+en\\s+(\\d{4})/i);if(bam)d.annee_construction=N(bam[1]);}
if(!d.etat_bien){if(/\\br[eé]cent\\b/i.test(blt))d.etat_bien='Bon état';else if(/\\b[aà]\\s+r[eé]nover\\b/i.test(blt))d.etat_bien='À rénover';else if(/\\b[aà]\\s+rafra[iî]chir\\b/i.test(blt))d.etat_bien='À rafraîchir';else if(/\\bbon\\s+[eé]tat\\b/i.test(blt)||/\\br[eé]nov[eé]\\b/i.test(blt))d.etat_bien='Bon état';}
if(!d.taxe_fonciere){var btf=blt.match(/taxe\\s+fonci[eè]re\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(btf){var btfv=N(btf[1]);if(btfv&&btfv>=100&&btfv<=10000)d.taxe_fonciere=btfv;}}
}
}catch(e){}
}
if(pf==='PAP'){
try{
if(!d.dpe){var dpeA=document.querySelector('.energy-indice .active,.energy-indice li.active');if(dpeA){var da=(dpeA.textContent||'').trim();if(/^[A-G]$/i.test(da))d.dpe=da.toUpperCase();}}
if(!d.ges){var gesA=document.querySelector('.ges-indice .active,.ges-indice li.active');if(gesA){var ga=(gesA.textContent||'').trim();if(/^[A-G]$/i.test(ga))d.ges=ga.toUpperCase();}}
if(!d.description){var descPAP=document.querySelector('.item-description');if(descPAP){var dpt=(descPAP.textContent||'').trim();if(dpt.length>80)d.description=dpt;}}
if(!d.surface_m2||!d.nb_pieces||!d.nb_chambres||!d.etage){
var papFeats=document.querySelectorAll('.item-tags li,[class*="item-tags"] li,[class*="item-summary"] li');
for(var fi=0;fi<papFeats.length;fi++){var ft=(papFeats[fi].textContent||'').trim();
if(!d.surface_m2){var sm=ft.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(sm)d.surface_m2=N(sm[1]);}
if(!d.nb_pieces){var pm=ft.match(/(\\d+)\\s?pi[eè]ces?/i);if(pm)d.nb_pieces=N(pm[1]);}
if(!d.nb_chambres){var cm=ft.match(/(\\d+)\\s?chambres?/i);if(cm)d.nb_chambres=N(cm[1]);}
if(!d.etage){var em=ft.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage(?!s)|t\\.)/i)||ft.match(/[eé](?:tage(?!s)|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(em)d.etage=em[1];}
if(!d.etage&&/rez[\\s-]?de[\\s-]?chauss/i.test(ft))d.etage='RDC';
}}
}catch(e){}
}
if(pf==='Orpi'){
try{
if(!d.dpe){var dpeO=document.querySelector('.c-dpe:not(.c-dpe--ges) .c-dpe__index--active');if(dpeO){var dv=(dpeO.textContent||'').trim().charAt(0);if(/^[A-G]$/i.test(dv))d.dpe=dv.toUpperCase();}}
if(!d.ges){var gesO=document.querySelector('.c-dpe--ges .c-dpe__index--active');if(gesO){var gv=(gesO.textContent||'').trim().charAt(0);if(/^[A-G]$/i.test(gv))d.ges=gv.toUpperCase();}}
if(!d.prix){var prO=document.querySelector('[class*="price-tag"],[class*="price_tag"],[class*="c-price"]');if(prO){var pv=N(prO.textContent);if(pv&&pv>=10000)d.prix=pv;}}
if(!d.description||d.description.length<100){
var h2s=document.querySelectorAll('h2');for(var hi=0;hi<h2s.length;hi++){if(/avis|description|pr[eé]sentation/i.test(h2s[hi].textContent||'')){var nxt=h2s[hi].nextElementSibling;if(nxt){var nt=(nxt.textContent||'').trim();if(nt.length>80){d.description=nt;break;}}}}
if(!d.description||d.description.length<100){var descO=document.querySelector('[class*="description-content"],[class*="description__content"],[class*="agency-opinion"]');if(descO){var dot=(descO.textContent||'').trim();if(dot.length>80)d.description=dot;}}
}
if(!d.surface_m2||!d.nb_pieces||!d.nb_chambres){var h2o=document.querySelectorAll('h2');for(var hi2=0;hi2<h2o.length;hi2++){if(/essentiel|int[eé]rieur/i.test(h2o[hi2].textContent||'')){var spO=h2o[hi2].nextElementSibling?h2o[hi2].nextElementSibling.querySelectorAll('span,p,li'):[];for(var si=0;si<spO.length;si++){var st=(spO[si].textContent||'').trim();if(!d.surface_m2){var smO=st.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(smO)d.surface_m2=N(smO[1]);}if(!d.nb_pieces){var pmO=st.match(/(\\d+)\\s?pi[eè]ces?/i);if(pmO)d.nb_pieces=N(pmO[1]);}if(!d.nb_chambres){var cmO=st.match(/(\\d+)\\s?chambres?/i);if(cmO)d.nb_chambres=N(cmO[1]);}}}}}
var opm=location.pathname.match(/-(\\d{5})-[0-9a-f]{8}/);
if(opm&&!d.code_postal)d.code_postal=opm[1];
if(!d.ville){var ovm=location.pathname.match(/annonce-(?:vente|location)-\\w+-t\\d+-(.*?)-(\\d{5})-/);if(ovm)d.ville=ovm[1].split('-').map(function(p){return cap(p);}).join('-');}
if(!d.ville||!d.code_postal){var locO=document.querySelector('[class*="infos__location"],[class*="localisation"]');if(locO){var lt=(locO.textContent||'').trim();if(!d.code_postal){var cpO=lt.match(/\\b(\\d{5})\\b/);if(cpO)d.code_postal=cpO[1];}if(!d.ville){var vlO=lt.match(/([A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+(?:[- ][A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+)*)/);if(vlO)d.ville=vlO[1];}}}
}catch(e){}
}
if(pf==='Century21'){
try{
if(!d.prix){var c21p=document.querySelector('.c-the-property-abstract__price');if(c21p){var c21v=N(c21p.textContent);if(c21v&&c21v>=1000)d.prix=c21v;}}
var c21li=document.querySelectorAll('.c-the-property-detail-global-view__list li');
var c21ch=0;
for(var ci=0;ci<c21li.length;ci++){var ct=(c21li[ci].textContent||'').trim();
if(!d.surface_m2){var csm=ct.match(/surface\\s*(?:habitable)?\\s*:\\s*(\\d+(?:[.,]\\d+)?)\\s*m/i);if(csm)d.surface_m2=N(csm[1]);}
if(!d.nb_pieces){var cpm=ct.match(/nombre de pi[eè]ces\\s*:\\s*(\\d+)/i);if(cpm)d.nb_pieces=N(cpm[1]);}
if(/^chambre$/i.test(ct))c21ch++;
}
if(c21ch>0&&!d.nb_chambres)d.nb_chambres=c21ch;
if(!d.description){var c21d=Array.from(document.querySelectorAll('h2')).find(function(h){return/description/i.test(h.textContent);});if(c21d&&c21d.nextElementSibling){var c21dt=(c21d.nextElementSibling.textContent||'').trim();if(c21dt.length>80)d.description=c21dt;}}
var c21abs=document.querySelector('.c-the-property-abstract');
if(c21abs){var c21t=(c21abs.textContent||'');if(!d.code_postal){var c21cp=c21t.match(/\\b(\\d{5})\\b/);if(c21cp)d.code_postal=c21cp[1];}if(!d.ville){var c21v2=c21t.match(/([A-Z\\u00C0-\\u00DC]{2,})/);if(c21v2)d.ville=cap(c21v2[1]);}}
function kwhToLetter(v){return v<=70?'A':v<=110?'B':v<=180?'C':v<=250?'D':v<=330?'E':v<=420?'F':'G';}
function co2ToLetter(v){return v<=6?'A':v<=11?'B':v<=30?'C':v<=50?'D':v<=70?'E':v<=100?'F':'G';}
var c21dpe=document.querySelector('.c-the-dpe-ges-new-dpe-svg');
if(c21dpe){var c21st=c21dpe.querySelectorAll('svg text');var c21nums=[];
for(var si=0;si<c21st.length;si++){var sv=c21st[si].textContent.trim();if(/^\\d+$/.test(sv)){var sn=parseInt(sv);if(sn>=20)c21nums.push(sn);}}
if(c21nums.length>=2&&!d.dpe){var dpeL=kwhToLetter(c21nums[0]);var gesL=co2ToLetter(c21nums[1]);d.dpe=dpeL>gesL?dpeL:gesL;if(!d.ges)d.ges=gesL;}}
if(!d.ges){var c21ges=document.querySelector('.c-the-dpe-ges-new-ges-svg');if(c21ges){var c21gt=c21ges.querySelectorAll('svg text');for(var gi=0;gi<c21gt.length;gi++){var gv=c21gt[gi].textContent.trim();if(/^\\d+$/.test(gv)){var gn=parseInt(gv);if(gn>=5&&gn<=600){d.ges=co2ToLetter(gn);break;}}}}}
var c21tk=document.querySelector('.c-the-property-detail-to-know');
if(c21tk){var c21tt=(c21tk.textContent||'');
if(!d.taxe_fonciere){var c21tf=c21tt.match(/taxe\\s+fonci[eè]re\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(c21tf)d.taxe_fonciere=N(c21tf[1]);}
if(!d.annee_construction){var c21ac=c21tt.match(/ann[eé]e\\s+(?:de\\s+)?construction\\s*[:\\-]?\\s*(\\d{4})/i)||c21tt.match(/construit\\w*\\s+en\\s+(\\d{4})/i);if(c21ac)d.annee_construction=N(c21ac[1]);}
if(!d.etat_bien){if(/\\btr[eè]s\\s+bon\\s+[eé]tat\\b/i.test(c21tt)||/\\bparfait\\s+[eé]tat\\b/i.test(c21tt)||/\\bexcellent\\s+[eé]tat\\b/i.test(c21tt))d.etat_bien='Bon état';else if(/\\b[aà]\\s+r[eé]nover\\b/i.test(c21tt))d.etat_bien='À rénover';else if(/\\b[aà]\\s+rafra[iî]chir\\b/i.test(c21tt))d.etat_bien='À rafraîchir';else if(/\\bbon\\s+[eé]tat\\b/i.test(c21tt)||/\\br[eé]nov[eé]\\b/i.test(c21tt))d.etat_bien='Bon état';else if(/\\bneuf\\b/i.test(c21tt))d.etat_bien='Neuf';}
}
var c21eq=document.querySelector('.c-the-property-detail-equipment');
if(c21eq){var c21et=(c21eq.textContent||'');
if(!d.etage){var c21em=c21et.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé]tage/i);if(c21em)d.etage=c21em[1];else if(/rez[\\s-]?de[\\s-]?chauss/i.test(c21et))d.etage='RDC';}
if(d.ascenseur===undefined&&/\\bascenseur\\b/i.test(c21et))d.ascenseur=true;
}
}catch(e){}
}
if(pf==='Laforet'){
try{
if(!d.prix){var lfp=document.body.innerText.match(/(\\d[\\d\\s]{4,9})\\s*€/);if(lfp){var lfpv=N(lfp[1]);if(lfpv&&lfpv>=10000)d.prix=lfpv;}}
var lfSecs=document.querySelectorAll('h3');
for(var li=0;li<lfSecs.length;li++){var lfs=lfSecs[li];if(!/surface|int[eé]rieur|autres|ext[eé]rieur/i.test(lfs.textContent||''))continue;
var lfp2=lfs.parentElement;if(!lfp2)continue;var lfItems=lfp2.querySelectorAll('span');
for(var lj=0;lj<lfItems.length;lj++){var lft=(lfItems[lj].textContent||'').trim();
if(!d.surface_m2){var lsm=lft.match(/surface\\s*:\\s*(\\d+(?:[.,]\\d+)?)\\s*m/i);if(lsm)d.surface_m2=N(lsm[1]);}
if(!d.nb_pieces){var lpm=lft.match(/(\\d+)\\s?pi[eè]ces?/i);if(lpm)d.nb_pieces=N(lpm[1]);}
if(!d.nb_chambres){var lcm=lft.match(/(\\d+)\\s?ch(?:ambres?|bres?)\\b/i);if(lcm)d.nb_chambres=N(lcm[1]);}
if(!d.etage){var lem=lft.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé]tage/i);if(lem)d.etage=lem[1];else if(/rez[\\s-]?de[\\s-]?chauss/i.test(lft))d.etage='RDC';}
if(!d.annee_construction){var lam=lft.match(/ann\\.?\\s*const\\.?\\s*:\\s*(\\d{4})/i);if(lam)d.annee_construction=N(lam[1]);}
if(!d.charges_copro_annuelles){var lcco=lft.match(/charges\\s+mensuelles\\s+copro\\s*:\\s*(\\d[\\d\\s]*)\\s*€/i);if(lcco){var lcv=N(lcco[1]);if(lcv)d.charges_copro_annuelles=lcv*12;}}
if(!d.taxe_fonciere){var ltf=lft.match(/taxe\\s+fonci[eè]re\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(ltf){var ltfv=N(ltf[1]);if(ltfv&&ltfv>=100&&ltfv<=10000)d.taxe_fonciere=ltfv;}}
if(!d.etat_bien){if(/\\b[aà]\\s+r[eé]nover\\b/i.test(lft))d.etat_bien='À rénover';else if(/\\b[aà]\\s+rafra[iî]chir\\b/i.test(lft))d.etat_bien='À rafraîchir';else if(/\\bbon\\s+[eé]tat\\b/i.test(lft)||/\\br[eé]nov[eé]\\b/i.test(lft)||/\\btr[eè]s\\s+bon/i.test(lft))d.etat_bien='Bon état';else if(/\\bneuf\\b/i.test(lft))d.etat_bien='Neuf';}
if(d.ascenseur===undefined&&/^\\s*ascenseur\\s*$/i.test(lft))d.ascenseur=true;
}}
if(!d.description){var lfDesc=Array.from(document.querySelectorAll('h2')).find(function(h){return h.textContent.trim()==='Description';});if(lfDesc&&lfDesc.nextElementSibling){var lfdt=(lfDesc.nextElementSibling.textContent||'').trim();if(lfdt.length>80)d.description=lfdt;}}
}catch(e){}
}
try{
if(!d.dpe||!d.ges){
var diagEls=document.querySelectorAll('[class*="dpe"],[class*="Dpe"],[class*="energy"],[class*="Energy"],[class*="diagnostic"],[class*="Diagnostic"],[class*="etiquette"],[class*="Etiquette"]');
for(var di=0;di<diagEls.length;di++){
var de=diagEls[di];
var dt2=(de.textContent||'')+(de.getAttribute('aria-label')||'')+(de.getAttribute('title')||'');
var imgs=de.querySelectorAll('img');for(var ii=0;ii<imgs.length;ii++){dt2+=' '+(imgs[ii].getAttribute('alt')||'')+(imgs[ii].getAttribute('title')||'');}
if(!d.dpe){var dm3=dt2.match(/\\(DPE\\)\\s*([A-G])/i)||dt2.match(/(?:DPE|[ÉE]nergie|Consommation|[Cc]lasse\\s+[eé]nerg)[^A-G]{0,30}\\b([A-G])\\b/i);if(dm3)d.dpe=dm3[1].toUpperCase();}
if(!d.ges){var gm3=dt2.match(/\\(GES\\)\\s*([A-G])/i)||dt2.match(/(?:GES|[Gg]az|[Cc]limat|[ÉE]mission)[^A-G]{0,30}\\b([A-G])\\b/i);if(gm3)d.ges=gm3[1].toUpperCase();}
}
}
}catch(e){}
var path=location.pathname;
var slm=path.match(/\\/annonces\\/\\w+\\/[\\w-]+\\/([^\\/]+)\\/([^\\/]+)\\/\\d+/);
if(slm){
var loc=slm[1];var qr=slm[2];
var parts=loc.split('-');
var villeParts=[];
for(var i=0;i<parts.length;i++){
if(/^\\d+(?:er|e|eme|[eè]me)?$/.test(parts[i]))break;
if(/^\\d{1,3}$/.test(parts[i])&&i===parts.length-1)break;
villeParts.push(parts[i]);
}
if(villeParts.length>0&&!d.ville)d.ville=villeParts.map(function(p){return cap(p);}).join('-');
if(qr&&!/^\\d+\\.htm/.test(qr)&&!d.quartier)d.quartier=qr.split('-').map(function(p){return cap(p);}).join(' ');
}
if(od){
if(!d.prix){var pm=od.match(/(\\d[\\d\\s]{4,9})\\s?€/g);if(pm){for(var i=0;i<pm.length;i++){var pv=N(pm[i]);if(pv&&pv>=10000){d.prix=pv;break;}}}}
if(!d.ville){var vm=od.match(/([A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+(?:[- ][A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+)*)\\s*\\(\\d{5}\\)/);if(vm)d.ville=vm[1].trim();}
if(!d.code_postal){var cm=od.match(/\\((\\d{5})\\)/);if(cm)d.code_postal=cm[1];}
}
if(!d.type_bien){var tbt={studio:'Studio',appartement:'Appartement',duplex:'Duplex',loft:'Loft',maison:'Maison',immeuble:'Immeuble'};var tbp=path.toLowerCase();for(var tbk in tbt){if(tbp.indexOf(tbk)>-1){d.type_bien=tbt[tbk];break;}}}
if(!d.type_bien&&od){var odl=od.toLowerCase();var tbt2={studio:'Studio',appartement:'Appartement',duplex:'Duplex',loft:'Loft',maison:'Maison',immeuble:'Immeuble'};for(var tbk2 in tbt2){if(odl.indexOf(tbk2)>-1){d.type_bien=tbt2[tbk2];break;}}}
if(d.prix===undefined){
var sels=['[data-qa-id="adview_price"]','[data-testid="price"]','[data-test="price"]','[class*="Price"]','[class*="price"]','.price'];
for(var i=0;i<sels.length;i++){
var el=document.querySelector(sels[i]);
if(el){var n=N(el.textContent);if(n&&n>=1000){d.prix=n;break;}}
}
}
try{
var descSels=['[class*="DescriptionTexts"]','[class*="Description_text"]','[class*="descriptionContent"]','[data-testid*="description"]','[class*="description__text"]','[itemprop="description"]','[class*="see-more-description"]','.item-description'];
for(var i=0;i<descSels.length;i++){
var de=document.querySelector(descSels[i]);
if(de){var dt=(de.textContent||'').trim();if(dt.length>80&&(!d.description||dt.length>d.description.length)){d.description=dt;break;}}
}
}catch(e){}
function F(t){var d={},m;
if(m=t.match(/(\\d+(?:[.,]\\d+)?)\\s?m(?:2\\b|²)/i))d.surface_m2=N(m[1]);
if(m=t.match(/(\\d+)\\s?pi[eè]ces?\\b/i))d.nb_pieces=N(m[1]);
if(m=t.match(/(\\d+)\\s?ch(?:ambres?|bres?)\\b/i))d.nb_chambres=N(m[1]);
m=t.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage(?!s)|t\\.)/i)||t.match(/[eé](?:tage(?!s)|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(m)d.etage=m[1];else if(/rez[\\s-]?de[\\s-]?chauss[eé]e/i.test(t))d.etage='RDC';
if(/sans ascenseur/i.test(t))d.ascenseur=false;else if(/\\bascenseur\\b/i.test(t))d.ascenseur=true;
m=t.match(/\\(DPE\\)\\s*([A-G])/i)||t.match(/\\bdpe\\s*[:\\-]?\\s*([A-G])\\b/i);if(m)d.dpe=m[1].toUpperCase();
m=t.match(/\\(GES\\)\\s*([A-G])/i)||t.match(/\\b(?:ges|climat)\\s*[:\\-]?\\s*([A-G])\\b/i);if(m)d.ges=m[1].toUpperCase();
if(/\\b[aà]\\s+r[eé]nover\\b/i.test(t))d.etat_bien='À rénover';else if(/\\b[aà]\\s+rafra[iî]chir\\b/i.test(t))d.etat_bien='À rafraîchir';else if(/\\bbon\\s+[eé]tat\\b/i.test(t)||/\\b(?:r[eé]nov[eé]|refait|r[eé]habilit[eé]|restaur[eé]|entretenu)\\b/i.test(t))d.etat_bien='Bon état';else if(/\\b(?:programme|bien|logement|construction|[eé]tat|vente\\s+de)\\s+neuf\\b/i.test(t)||/\\brefait\\s+[aà]\\s+neuf\\b/i.test(t))d.etat_bien='Neuf';
m=t.match(/construit\\w* en (\\d{4})/i)||t.match(/ann[eé]e de construction\\s*[:\\-]?\\s*(\\d{4})/i)||t.match(/ann\\.?\\s*const\\.?\\s*[:\\-]?\\s*(\\d{4})/i)||t.match(/(?:immeuble|r[eé]sidence|b[aâ]timent)\\s+(?:de|du)\\s+(\\d{4})/i)||t.match(/(?:b[aâ]ti|[eé]difi[eé]|[eé]rig[eé]|livr[eé])\\w*\\s+en\\s+(\\d{4})/i)||t.match(/dat\\w+\\s+(?:de|du)\\s+(\\d{4})/i);if(m)d.annee_construction=N(m[1]);
m=t.match(/charges?\\s+(?:de\\s+)?copropri[eé]t[eé]\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(m){var ccv=N(m[1]);if(ccv&&ccv>=100&&ccv<=20000)d.charges_copro_annuelles=ccv;}
m=t.match(/taxe\\s+fonci[eè]re\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i)||t.match(/T\\.?F\\.?\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/)||t.match(/imp[oô]t\\s+foncier\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i)||t.match(/foncier\\s+(?:annuel)?\\s*[:\\-]?\\s*(\\d[\\d\\s]*)\\s*€/i);if(m){var tfv=N(m[1]);if(tfv&&tfv>=100&&tfv<=10000)d.taxe_fonciere=tfv;}
if(m=t.match(/\\b(\\d{5})\\b/))d.code_postal=m[1];
if(m=t.match(/((?:0|\\+33\\s?)[1-9](?:[\\s.\\-]?\\d{2}){4})\\b/i))d.contact_telephone=m[1].trim();
if(m=t.match(/([\\w.+\\-]+@[\\w\\-]+\\.[a-zA-Z]{2,})/))d.contact_email=m[1].trim();
var pm=t.match(/(\\d[\\d\\s]{4,9})\\s?€/g);
if(pm){for(var i=0;i<pm.length;i++){var v=N(pm[i]);if(v&&v>=10000){d.prix=v;break;}}}
return d;}
if(d.description){var fd=F(d.description);for(var k in fd)if(d[k]===undefined)d[k]=fd[k];}
var fr=F(document.body.innerText||'');
for(var k in fr)if(d[k]===undefined)d[k]=fr[k];
d.url=location.href;
d.plateforme=pf;
try{
var enc=btoa(unescape(encodeURIComponent(JSON.stringify(d))));
var url='__APP_ORIGIN__/appartements/nouveau?prefill='+encodeURIComponent(enc);
if(w){w.location.href=url;setTimeout(collapseVoir,200);}else{location.href=url;}
}catch(err){if(w)w.close();alert('Bookmarklet Immoscore: '+err.message);}
}
function collapseVoir(){
try{
var els=document.querySelectorAll('[data-blm-done]');
for(var i=els.length-1;i>=0;i--){
var el=els[i];
try{
if(el.tagName==='SUMMARY'&&el.parentElement&&el.parentElement.tagName==='DETAILS'){el.parentElement.open=false;}
else if(el.tagName!=='A'){el.click();}
}catch(e){}
el.removeAttribute('data-blm-done');
}
}catch(e){}
}
expandVoir(go);
})();`;

// Pas d'encodeURIComponent ici : un lien "javascript:" n'est pas décodé par
// le navigateur, le contenu après "javascript:" est évalué tel quel. React
// se charge de l'échappement HTML correct de l'attribut href à l'affichage.
export function buildBookmarkletHref(appOrigin: string): string {
  const source = BOOKMARKLET_SOURCE.replace("__APP_ORIGIN__", appOrigin).replace(/\n/g, "");
  return `javascript:${source}`;
}
