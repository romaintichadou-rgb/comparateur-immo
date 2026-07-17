/**
 * Bookmarklet "Importer dans Immoscore". S'exécute dans le
 * navigateur de l'utilisateur, sur une page d'annonce déjà chargée
 * normalement (aucune requête automatisée vers le site source) : il lit les
 * données déjà présentes dans le DOM/JSON embarqué et les transmet à l'app
 * via un paramètre d'URL. Aucune détection anti-bot possible côté site
 * source puisqu'il n'y a pas de scraping, juste une lecture locale d'une
 * page consultée normalement par un humain.
 *
 * Avant d'extraire, déplie tout ce qui peut masquer de l'information :
 * boutons/liens "Voir plus / En savoir plus / Voir la description...",
 * boutons "Voir le numéro" (texte non anchoré en début de chaîne : certains
 * sites préfixent le libellé visible par un texte d'accessibilité caché ou
 * un <title> de SVG dans le même élément), accordéons signalés par
 * `aria-expanded="false"`, et blocs `<details>` natifs. Fait plusieurs
 * passes successives (un clic peut révéler de nouveaux boutons à déplier),
 * jusqu'à ce qu'une passe ne trouve plus rien de nouveau ou après 5 passes
 * maximum — garde-fou contre une page qui génère du contenu à l'infini.
 * N'ouvre jamais un vrai lien de navigation (seuls les liens "vides" —
 * href="#" ou "javascript:..." — sont considérés comme des déclencheurs
 * d'affichage, jamais une vraie destination) : cliquer sur "tout" sans
 * discrimination ferait quitter la page avant l'extraction.
 *
 * Laisse le DOM se mettre à jour, puis lit le texte complet. La
 * redirection se fait via `location.href` (pas
 * `window.open`) : après un `setTimeout`, la plupart des navigateurs
 * bloquent l'ouverture d'un nouvel onglet comme un pop-up non désiré.
 *
 * Le code ci-dessous est volontairement écrit en ES5/syntaxe permissive
 * (var, pas de flèches) pour rester exécutable tel quel sur un maximum de
 * pages tierces sans étape de build.
 */
const BOOKMARKLET_SOURCE = `(function(){
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
function N(v){if(v==null)return undefined;var s=String(v).replace(/[^\\d,.\\-]/g,'').replace(',','.');var n=parseFloat(s);return isNaN(n)?undefined:n;}
function findPrice(){
var sels=['[data-qa-id="adview_price"]','[data-testid="price"]','[class*="Price"]','.price'];
for(var i=0;i<sels.length;i++){
var el=document.querySelector(sels[i]);
if(el){var n=N(el.textContent);if(n&&n>=1000)return n;}
}
return undefined;
}
function F(t){var d={},m,pm,best;
if(m=t.match(/(\\d+(?:[.,]\\d+)?)\\s?m(?:2\\b|²)/i))d.surface_m2=N(m[1]);
if(m=t.match(/(\\d+)\\s?pi[eè]ces?\\b/i))d.nb_pieces=N(m[1]);
if(m=t.match(/(\\d+)\\s?chambres?\\b/i))d.nb_chambres=N(m[1]);
if(m=t.match(/(\\d+)(?:er|e|ème)?\\s?étage/i))d.etage=m[1];else if(/rez[\\s-]?de[\\s-]?chauss[eé]e/i.test(t))d.etage='RDC';
if(/sans ascenseur/i.test(t))d.ascenseur=false;else if(/\\bascenseur\\b/i.test(t))d.ascenseur=true;
if(m=t.match(/\\bdpe\\s*[:\\-]?\\s*([A-G])\\b/i))d.dpe=m[1].toUpperCase();
if(m=t.match(/\\b(?:ges|climat)\\s*[:\\-]?\\s*([A-G])\\b/i))d.ges=m[1].toUpperCase();
if(m=t.match(/construit\\w* en (\\d{4})/i))d.annee_construction=N(m[1]);
if(m=t.match(/charges?\\s+(?:de\\s+)?copropri[eé]t[eé][^\\d]{0,20}(\\d[\\d\\s]*)\\s?€/i))d.charges_copro_annuelles=N(m[1]);
if(m=t.match(/\\b(\\d{5})\\b/))d.code_postal=m[1];
if(m=t.match(/((?:0|\\+33\\s?)[1-9](?:[\\s.\\-]?\\d{2}){4})\\b/i))d.contact_telephone=m[1].trim();
if(m=t.match(/([\\w.+\\-]+@[\\w\\-]+\\.[a-zA-Z]{2,})/))d.contact_email=m[1].trim();
pm=t.match(/(\\d[\\d\\s]{4,9})\\s?€/g);
if(pm){best=undefined;for(var i=0;i<pm.length;i++){var v=N(pm[i]);if(v&&v>=10000&&(best===undefined||v>best))best=v;}if(best!==undefined)d.prix=best;}
return d;}
var h=location.hostname.replace('www.','');
var pf='Manuel';
if(h.indexOf('leboncoin.fr')>-1)pf='Leboncoin';
else if(h.indexOf('seloger.com')>-1)pf='SeLoger';
else if(h.indexOf('pap.fr')>-1)pf='PAP';
else if(h.indexOf('orpi.com')>-1)pf='Orpi';
var d={};
var od=T('meta[property="og:description"]')||T('meta[name="description"]');if(od)d.description=od.trim();
var oi=T('meta[property="og:image"]');if(oi)d.photo_url=oi;
try{
var el=document.querySelector('#__NEXT_DATA__');
if(el){
var j=JSON.parse(el.textContent);
var ad=j&&j.props&&j.props.pageProps&&j.props.pageProps.ad;
if(ad){
if(ad.body)d.description=ad.body;
var pr=N(Array.isArray(ad.price)?ad.price[0]:ad.price);if(pr)d.prix=pr;
if(ad.location){
if(ad.location.city)d.ville=ad.location.city;
if(ad.location.zipcode)d.code_postal=ad.location.zipcode;
if(ad.location.district)d.quartier=ad.location.district;
}
var at=ad.attributes||[];
function A(k){for(var i=0;i<at.length;i++)if(at[i].key===k)return at[i];return null;}
var a;
if((a=A('square'))&&N(a.value))d.surface_m2=N(a.value);
if((a=A('rooms'))&&N(a.value))d.nb_pieces=N(a.value);
if((a=A('bedrooms'))&&N(a.value))d.nb_chambres=N(a.value);
if((a=A('floor'))&&a.value)d.etage=a.value;
if((a=A('elevator'))&&a.value)d.ascenseur=(a.value==='1'||a.value==='true');
if((a=A('energy_rate')))d.dpe=a.value_label||a.value;
if((a=A('ghg')))d.ges=a.value_label||a.value;
if((a=A('charges_included'))&&N(a.value))d.charges_copro_annuelles=N(a.value);
var im=(ad.images&&ad.images.urls)||[];if(im[0])d.photo_url=im[0];
}
}
}catch(e){}
if(d.prix===undefined){var dp=findPrice();if(dp!==undefined)d.prix=dp;}
var fr=F(document.body.innerText||'');
for(var k in fr)if(d[k]===undefined)d[k]=fr[k];
d.url=location.href;
d.plateforme=pf;
var enc=btoa(unescape(encodeURIComponent(JSON.stringify(d))));
location.href='__APP_ORIGIN__/appartements/nouveau?prefill='+enc;
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
