# Sesli Oda

Giriş geElectron Builder ile oluşturulur.

## Gereksinimler

- Node.js 22 veya üzeri
- Docker Desktop

## Yerel geliştirme

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. Bağımlılıkları yükleyin: `npm install`
3. LiveKit ve API hizmetlerini başlatın: `docker compose up --build`
4. Ayrı bir terminalde istemciyi başlatın: `npm run dev`
5. `http://localhost:5173` adresini açıp bir oda oluşturun.

Yerel LiveKit geliştirme sunucusu `devkey` / `secret` anahtarlarını kullanır. Bunları internete açık üretim ortamında kullanmayın. Üretimde LiveKit'in güvenli anahtarlarını, herkese açık WebSocket adresini (`wss://...`), uygulama adresini, API adresini (`VITE_API_BASE_URL`) ve API rektirmeyen, davet bağlantısıyla katılınan sesli sohbet ve ekran paylaşımı uygulaması. İstemci web üzerinde ve Electron masaüstü kabuğunda çalışır; macOS ve Windows paketleri CORS kaynağını yapılandırın. Masaüstü paketi yerel bir `file://` kaynağından açıldığı için API CORS kaynağını paket dağıtımında `null` olarak ayarlayın. İnternetten ses ve ekran aktarımı için LiveKit'in yanında uygun TURN/UDP ağ yapılandırması da gerekir.

## Masaüstü paketleri

`npm run desktop` mevcut işletim sistemi için paket üretir. Windows kurulum dosyası Windows'ta, macOS disk imajı ise macOS'ta oluşturulmalıdır. Paylaşılan davet bağlantılarının herkes tarafından açılabilmesi için web istemcisini HTTPS üzerinden yayınlayın; `.env` içindeki `APP_PUBLIC_URL` değerini bu web adresiyle eşleştirin.

Odalar rastgele UUID ile oluşturulur ve boş kaldıktan 10 dakika sonra kapanır. Sunucu her odayı 20 katılımcıyla sınırlar. Katılım belirteci oda özelinde ve bir saat geçerlidir.
