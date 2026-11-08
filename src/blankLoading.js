// Boş yükleme ekranı: PlayCanvas logosu/çubuğu görünmez (uygulama kendi beyaz yükleme ekranını gösterir).
// NOT: PlayCanvas çıktısı alınınca bu dosya public/__loading__.js üzerine kopyalanır.
pc.script.createLoadingScreen(function (app) {
  var css = document.createElement('style');
  css.textContent = 'html,body{background:#0e0818!important}#application-splash-wrapper{display:none!important}';
  document.head.appendChild(css);
});
