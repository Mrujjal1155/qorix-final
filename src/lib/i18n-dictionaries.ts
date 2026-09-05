/**
 * Translations for the public website.
 * Keys are the English source strings, so untranslated text falls back to English.
 */
export type LocaleCode = "en" | "en-NG" | "pt-BR" | "es" | "hi" | "ur" | "bn" | "ar";

type Entry = Partial<Record<Exclude<LocaleCode, "en" | "en-NG">, string>>;

export const TRANSLATIONS: Record<string, Entry> = {
  /* ---------- navigation / header ---------- */
  Home: { "pt-BR": "Início", es: "Inicio", hi: "होम", ur: "ہوم", bn: "হোম", ar: "الرئيسية" },
  About: { "pt-BR": "Sobre", es: "Acerca de", hi: "हमारे बारे में", ur: "ہمارے بارے میں", bn: "আমাদের সম্পর্কে", ar: "من نحن" },
  "About Us": { "pt-BR": "Sobre nós", es: "Sobre nosotros", hi: "हमारे बारे में", ur: "ہمارے بارے میں", bn: "আমাদের সম্পর্কে", ar: "من نحن" },
  Products: { "pt-BR": "Produtos", es: "Productos", hi: "उत्पाद", ur: "پروڈکٹس", bn: "প্রোডাক্ট", ar: "المنتجات" },
  Store: { "pt-BR": "Loja", es: "Tienda", hi: "स्टोर", ur: "اسٹور", bn: "স্টোর", ar: "المتجر" },
  FAQ: { "pt-BR": "Perguntas frequentes", es: "Preguntas frecuentes", hi: "सामान्य प्रश्न", ur: "عام سوالات", bn: "সাধারণ প্রশ্ন", ar: "الأسئلة الشائعة" },
  Contact: { "pt-BR": "Contato", es: "Contacto", hi: "संपर्क", ur: "رابطہ", bn: "যোগাযোগ", ar: "اتصل بنا" },
  "Contact Us": { "pt-BR": "Fale conosco", es: "Contáctanos", hi: "संपर्क करें", ur: "ہم سے رابطہ کریں", bn: "যোগাযোগ করুন", ar: "تواصل معنا" },
  Reseller: { "pt-BR": "Revendedor", es: "Revendedor", hi: "रीसेलर", ur: "ری سیلر", bn: "রিসেলার", ar: "الموزّع" },
  "Become a Reseller": { "pt-BR": "Torne-se revendedor", es: "Conviértete en revendedor", hi: "रीसेलर बनें", ur: "ری سیلر بنیں", bn: "রিসেলার হোন", ar: "كن موزّعًا" },
  "Reseller Panel": { "pt-BR": "Painel do revendedor", es: "Panel de revendedor", hi: "रीसेलर पैनल", ur: "ری سیلر پینل", bn: "রিসেলার প্যানেল", ar: "لوحة الموزّع" },
  "Reseller Panel Login": { "pt-BR": "Entrar no painel do revendedor", es: "Acceso al panel de revendedor", hi: "रीसेलर पैनल लॉगिन", ur: "ری سیلر پینل لاگ ان", bn: "রিসেলার প্যানেল লগইন", ar: "دخول لوحة الموزّع" },
  "Apply as Reseller": { "pt-BR": "Inscreva-se como revendedor", es: "Solicitar ser revendedor", hi: "रीसेलर के लिए आवेदन करें", ur: "ری سیلر کے لیے درخواست دیں", bn: "রিসেলার হিসেবে আবেদন করুন", ar: "قدّم كموزّع" },
  "API Documentation": { "pt-BR": "Documentação da API", es: "Documentación de la API", hi: "एपीआई दस्तावेज़", ur: "API دستاویزات", bn: "API ডকুমেন্টেশন", ar: "وثائق API" },
  Search: { "pt-BR": "Buscar", es: "Buscar", hi: "खोजें", ur: "تلاش", bn: "সার্চ", ar: "بحث" },
  "Search products": { "pt-BR": "Buscar produtos", es: "Buscar productos", hi: "उत्पाद खोजें", ur: "پروڈکٹس تلاش کریں", bn: "প্রোডাক্ট খুঁজুন", ar: "ابحث عن المنتجات" },
  Cart: { "pt-BR": "Carrinho", es: "Carrito", hi: "कार्ट", ur: "کارٹ", bn: "কার্ট", ar: "السلة" },
  "Track order": { "pt-BR": "Rastrear pedido", es: "Rastrear pedido", hi: "ऑर्डर ट्रैक करें", ur: "آرڈر ٹریک کریں", bn: "অর্ডার ট্র্যাক", ar: "تتبع الطلب" },
  "Track your order": { "pt-BR": "Rastreie seu pedido", es: "Rastrea tu pedido", hi: "अपना ऑर्डर ट्रैक करें", ur: "اپنا آرڈر ٹریک کریں", bn: "আপনার অর্ডার ট্র্যাক করুন", ar: "تتبّع طلبك" },
  Account: { "pt-BR": "Conta", es: "Cuenta", hi: "खाता", ur: "اکاؤنٹ", bn: "অ্যাকাউন্ট", ar: "الحساب" },
  "My account": { "pt-BR": "Minha conta", es: "Mi cuenta", hi: "मेरा खाता", ur: "میرا اکاؤنٹ", bn: "আমার অ্যাকাউন্ট", ar: "حسابي" },
  "Log in": { "pt-BR": "Entrar", es: "Iniciar sesión", hi: "लॉग इन", ur: "لاگ ان", bn: "লগ ইন", ar: "تسجيل الدخول" },
  "Open menu": { "pt-BR": "Abrir menu", es: "Abrir menú", hi: "मेन्यू खोलें", ur: "مینو کھولیں", bn: "মেনু খুলুন", ar: "افتح القائمة" },
  "Open the store": { "pt-BR": "Abrir a loja", es: "Abrir la tienda", hi: "स्टोर खोलें", ur: "اسٹور کھولیں", bn: "স্টোর খুলুন", ar: "افتح المتجر" },
  Language: { "pt-BR": "Idioma", es: "Idioma", hi: "भाषा", ur: "زبان", bn: "ভাষা", ar: "اللغة" },
  "Change language": { "pt-BR": "Alterar idioma", es: "Cambiar idioma", hi: "भाषा बदलें", ur: "زبان تبدیل کریں", bn: "ভাষা পরিবর্তন করুন", ar: "تغيير اللغة" },
  "Change currency": { "pt-BR": "Alterar moeda", es: "Cambiar moneda", hi: "मुद्रा बदलें", ur: "کرنسی تبدیل کریں", bn: "মুদ্রা পরিবর্তন করুন", ar: "تغيير العملة" },

  /* ---------- footer ---------- */
  Categories: { "pt-BR": "Categorias", es: "Categorías", hi: "श्रेणियाँ", ur: "زمرے", bn: "ক্যাটাগরি", ar: "الفئات" },
  "Quick Links": { "pt-BR": "Links rápidos", es: "Enlaces rápidos", hi: "त्वरित लिंक", ur: "فوری لنکس", bn: "কুইক লিংক", ar: "روابط سريعة" },
  Support: { "pt-BR": "Suporte", es: "Soporte", hi: "सहायता", ur: "سپورٹ", bn: "সাপোর্ট", ar: "الدعم" },
  "We accept": { "pt-BR": "Aceitamos", es: "Aceptamos", hi: "हम स्वीकार करते हैं", ur: "ہم قبول کرتے ہیں", bn: "আমরা গ্রহণ করি", ar: "نقبل" },

  /* ---------- home ---------- */
  "Shop by category": { "pt-BR": "Compre por categoria", es: "Compra por categoría", hi: "श्रेणी के अनुसार खरीदें", ur: "زمرے کے مطابق خریداری", bn: "ক্যাটাগরি অনুযায়ী কিনুন", ar: "تسوّق حسب الفئة" },
  "All categories →": { "pt-BR": "Todas as categorias →", es: "Todas las categorías →", hi: "सभी श्रेणियाँ →", ur: "تمام زمرے →", bn: "সব ক্যাটাগরি →", ar: "كل الفئات →" },
  "Featured Products": { "pt-BR": "Produtos em destaque", es: "Productos destacados", hi: "विशेष उत्पाद", ur: "نمایاں پروڈکٹس", bn: "ফিচার্ড প্রোডাক্ট", ar: "منتجات مميزة" },
  "View All →": { "pt-BR": "Ver tudo →", es: "Ver todo →", hi: "सभी देखें →", ur: "سب دیکھیں →", bn: "সব দেখুন →", ar: "عرض الكل →" },
  products: { "pt-BR": "produtos", es: "productos", hi: "उत्पाद", ur: "پروڈکٹس", bn: "প্রোডাক্ট", ar: "منتجات" },

  /* ---------- store list ---------- */
  "All products": { "pt-BR": "Todos os produtos", es: "Todos los productos", hi: "सभी उत्पाद", ur: "تمام پروڈکٹس", bn: "সব প্রোডাক্ট", ar: "كل المنتجات" },
  "Same catalogue as our Telegram bot — pay with Binance Pay or USDT.": {
    "pt-BR": "O mesmo catálogo do nosso bot do Telegram — pague com Binance Pay ou USDT.",
    es: "El mismo catálogo que nuestro bot de Telegram: paga con Binance Pay o USDT.",
    hi: "हमारे टेलीग्राम बॉट जैसा ही कैटलॉग — Binance Pay या USDT से भुगतान करें।",
    ur: "ہمارے ٹیلیگرام بوٹ جیسا ہی کیٹلاگ — Binance Pay یا USDT سے ادائیگی کریں۔",
    bn: "আমাদের টেলিগ্রাম বটের মতো একই ক্যাটালগ — Binance Pay বা USDT দিয়ে পেমেন্ট করুন।",
    ar: "نفس كتالوج بوت تيليجرام — ادفع عبر Binance Pay أو USDT.",
  },
  "Search products…": { "pt-BR": "Buscar produtos…", es: "Buscar productos…", hi: "उत्पाद खोजें…", ur: "پروڈکٹس تلاش کریں…", bn: "প্রোডাক্ট খুঁজুন…", ar: "ابحث عن المنتجات…" },
  All: { "pt-BR": "Todos", es: "Todos", hi: "सभी", ur: "تمام", bn: "সব", ar: "الكل" },
  items: { "pt-BR": "itens", es: "artículos", hi: "आइटम", ur: "آئٹمز", bn: "আইটেম", ar: "عنصرًا" },
  "Loading catalogue…": { "pt-BR": "Carregando catálogo…", es: "Cargando catálogo…", hi: "कैटलॉग लोड हो रहा है…", ur: "کیٹلاگ لوڈ ہو رہا ہے…", bn: "ক্যাটালগ লোড হচ্ছে…", ar: "جارٍ تحميل الكتالوج…" },
  "No products found.": { "pt-BR": "Nenhum produto encontrado.", es: "No se encontraron productos.", hi: "कोई उत्पाद नहीं मिला।", ur: "کوئی پروڈکٹ نہیں ملا۔", bn: "কোনো প্রোডাক্ট পাওয়া যায়নি।", ar: "لم يتم العثور على منتجات." },

  /* ---------- product ---------- */
  "View Details": { "pt-BR": "Ver detalhes", es: "Ver detalles", hi: "विवरण देखें", ur: "تفصیلات دیکھیں", bn: "বিস্তারিত দেখুন", ar: "عرض التفاصيل" },
  "Buy Now": { "pt-BR": "Comprar agora", es: "Comprar ahora", hi: "अभी खरीदें", ur: "ابھی خریدیں", bn: "এখনই কিনুন", ar: "اشترِ الآن" },
  "Instant delivery": { "pt-BR": "Entrega instantânea", es: "Entrega instantánea", hi: "तुरंत डिलीवरी", ur: "فوری ڈیلیوری", bn: "ইনস্ট্যান্ট ডেলিভারি", ar: "تسليم فوري" },
  "Manual delivery": { "pt-BR": "Entrega manual", es: "Entrega manual", hi: "मैनुअल डिलीवरी", ur: "دستی ڈیلیوری", bn: "ম্যানুয়াল ডেলিভারি", ar: "تسليم يدوي" },
  Instant: { "pt-BR": "Instantâneo", es: "Instantáneo", hi: "तुरंत", ur: "فوری", bn: "ইনস্ট্যান্ট", ar: "فوري" },
  Manual: { "pt-BR": "Manual", es: "Manual", hi: "मैनुअल", ur: "دستی", bn: "ম্যানুয়াল", ar: "يدوي" },
  sold: { "pt-BR": "vendidos", es: "vendidos", hi: "बिके", ur: "فروخت", bn: "বিক্রি", ar: "مُباع" },
  "Out of stock": { "pt-BR": "Esgotado", es: "Agotado", hi: "स्टॉक खत्म", ur: "اسٹاک ختم", bn: "স্টক নেই", ar: "غير متوفر" },
  "In stock": { "pt-BR": "Em estoque", es: "En stock", hi: "स्टॉक में", ur: "اسٹاک میں", bn: "স্টকে আছে", ar: "متوفر" },

  /* ---------- track ---------- */
  "Order number": { "pt-BR": "Número do pedido", es: "Número de pedido", hi: "ऑर्डर नंबर", ur: "آرڈر نمبر", bn: "অর্ডার নম্বর", ar: "رقم الطلب" },
  "Email used at checkout": { "pt-BR": "E-mail usado na compra", es: "Correo usado en la compra", hi: "चेकआउट में उपयोग किया गया ईमेल", ur: "چیک آؤٹ میں استعمال شدہ ای میل", bn: "চেকআউটে ব্যবহৃত ইমেইল", ar: "البريد المستخدم عند الدفع" },
  "Check status": { "pt-BR": "Verificar status", es: "Comprobar estado", hi: "स्थिति जांचें", ur: "اسٹیٹس چیک کریں", bn: "স্ট্যাটাস দেখুন", ar: "تحقق من الحالة" },
  "Payment is being verified. Your delivery will appear here.": {
    "pt-BR": "O pagamento está sendo verificado. Sua entrega aparecerá aqui.",
    es: "El pago se está verificando. Tu entrega aparecerá aquí.",
    hi: "भुगतान की पुष्टि हो रही है। आपकी डिलीवरी यहाँ दिखाई देगी।",
    ur: "ادائیگی کی تصدیق ہو رہی ہے۔ آپ کی ڈیلیوری یہاں ظاہر ہوگی۔",
    bn: "পেমেন্ট যাচাই করা হচ্ছে। আপনার ডেলিভারি এখানে দেখা যাবে।",
    ar: "يتم التحقق من الدفع. سيظهر التسليم هنا.",
  },
  Order: { "pt-BR": "Pedido", es: "Pedido", hi: "ऑर्डर", ur: "آرڈر", bn: "অর্ডার", ar: "طلب" },

  /* ---------- auth ---------- */
  "Welcome back": { "pt-BR": "Bem-vindo de volta", es: "Bienvenido de nuevo", hi: "वापसी पर स्वागत है", ur: "خوش آمدید", bn: "আবার স্বাগতম", ar: "مرحبًا بعودتك" },
  "Create your account": { "pt-BR": "Crie sua conta", es: "Crea tu cuenta", hi: "अपना खाता बनाएं", ur: "اپنا اکاؤنٹ بنائیں", bn: "আপনার অ্যাকাউন্ট তৈরি করুন", ar: "أنشئ حسابك" },
  "Sign in to see your orders and deliveries.": {
    "pt-BR": "Entre para ver seus pedidos e entregas.",
    es: "Inicia sesión para ver tus pedidos y entregas.",
    hi: "अपने ऑर्डर और डिलीवरी देखने के लिए साइन इन करें।",
    ur: "اپنے آرڈرز اور ڈیلیوری دیکھنے کے لیے سائن ان کریں۔",
    bn: "আপনার অর্ডার ও ডেলিভারি দেখতে সাইন ইন করুন।",
    ar: "سجّل الدخول لعرض طلباتك وعمليات التسليم.",
  },
  "Sign up to keep every purchase and delivery in one dashboard.": {
    "pt-BR": "Cadastre-se para manter cada compra e entrega em um só painel.",
    es: "Regístrate para tener todas tus compras y entregas en un panel.",
    hi: "हर खरीद और डिलीवरी एक ही डैशबोर्ड में रखने के लिए साइन अप करें।",
    ur: "ہر خریداری اور ڈیلیوری ایک ڈیش بورڈ میں رکھنے کے لیے سائن اپ کریں۔",
    bn: "প্রতিটি কেনাকাটা ও ডেলিভারি এক ড্যাশবোর্ডে রাখতে সাইন আপ করুন।",
    ar: "سجّل لتتابع كل مشترياتك وعمليات التسليم في لوحة واحدة.",
  },
  "Full name": { "pt-BR": "Nome completo", es: "Nombre completo", hi: "पूरा नाम", ur: "پورا نام", bn: "পুরো নাম", ar: "الاسم الكامل" },
  Email: { "pt-BR": "E-mail", es: "Correo electrónico", hi: "ईमेल", ur: "ای میل", bn: "ইমেইল", ar: "البريد الإلكتروني" },
  Password: { "pt-BR": "Senha", es: "Contraseña", hi: "पासवर्ड", ur: "پاس ورڈ", bn: "পাসওয়ার্ড", ar: "كلمة المرور" },
  "Please wait…": { "pt-BR": "Aguarde…", es: "Por favor espera…", hi: "कृपया प्रतीक्षा करें…", ur: "براہ کرم انتظار کریں…", bn: "অপেক্ষা করুন…", ar: "يرجى الانتظار…" },
  "Sign in": { "pt-BR": "Entrar", es: "Iniciar sesión", hi: "साइन इन", ur: "سائن ان", bn: "সাইন ইন", ar: "تسجيل الدخول" },
  "Create account": { "pt-BR": "Criar conta", es: "Crear cuenta", hi: "खाता बनाएं", ur: "اکاؤنٹ بنائیں", bn: "অ্যাকাউন্ট তৈরি করুন", ar: "إنشاء حساب" },
  "Need an account? Sign up": { "pt-BR": "Precisa de uma conta? Cadastre-se", es: "¿Necesitas una cuenta? Regístrate", hi: "खाता चाहिए? साइन अप करें", ur: "اکاؤنٹ چاہیے؟ سائن اپ کریں", bn: "অ্যাকাউন্ট দরকার? সাইন আপ করুন", ar: "تحتاج حسابًا؟ سجّل الآن" },
  "Already have an account? Sign in": { "pt-BR": "Já tem uma conta? Entrar", es: "¿Ya tienes cuenta? Inicia sesión", hi: "पहले से खाता है? साइन इन करें", ur: "پہلے سے اکاؤنٹ ہے؟ سائن ان کریں", bn: "অ্যাকাউন্ট আছে? সাইন ইন করুন", ar: "لديك حساب؟ سجّل الدخول" },

  /* ---------- errors ---------- */
  "Page not found": { "pt-BR": "Página não encontrada", es: "Página no encontrada", hi: "पेज नहीं मिला", ur: "صفحہ نہیں ملا", bn: "পেজ পাওয়া যায়নি", ar: "الصفحة غير موجودة" },
  "Go home": { "pt-BR": "Ir para o início", es: "Ir al inicio", hi: "होम जाएं", ur: "ہوم پر جائیں", bn: "হোমে যান", ar: "العودة للرئيسية" },
  /* ---------- hero / features ---------- */
  "Instant digital delivery": { "pt-BR": "Entrega digital instantânea", es: "Entrega digital instantánea", hi: "तुरंत डिजिटल डिलीवरी", ur: "فوری ڈیجیٹل ڈیلیوری", bn: "ইনস্ট্যান্ট ডিজিটাল ডেলিভারি", ar: "تسليم رقمي فوري" },
  "Buy AI tools & subscriptions.": { "pt-BR": "Compre ferramentas de IA e assinaturas.", es: "Compra herramientas de IA y suscripciones.", hi: "एआई टूल्स और सब्सक्रिप्शन खरीदें।", ur: "AI ٹولز اور سبسکرپشنز خریدیں۔", bn: "এআই টুলস ও সাবস্ক্রিপশন কিনুন।", ar: "اشترِ أدوات الذكاء الاصطناعي والاشتراكات." },
  "Delivered in seconds.": { "pt-BR": "Entregue em segundos.", es: "Entregado en segundos.", hi: "सेकंडों में डिलीवर।", ur: "سیکنڈوں میں ڈیلیور۔", bn: "সেকেন্ডেই ডেলিভারি।", ar: "يصلك خلال ثوانٍ." },
  "Order from our website or Telegram bot. Pay with Binance Pay or USDT. Receive your account, key or activation code automatically — no waiting.": {
    "pt-BR": "Peça pelo nosso site ou bot do Telegram. Pague com Binance Pay ou USDT. Receba sua conta, chave ou código de ativação automaticamente — sem espera.",
    es: "Pide en nuestra web o bot de Telegram. Paga con Binance Pay o USDT. Recibe tu cuenta, clave o código de activación automáticamente, sin esperas.",
    hi: "हमारी वेबसाइट या टेलीग्राम बॉट से ऑर्डर करें। Binance Pay या USDT से भुगतान करें। अकाउंट, की या एक्टिवेशन कोड स्वतः प्राप्त करें — कोई इंतज़ार नहीं।",
    ur: "ہماری ویب سائٹ یا ٹیلیگرام بوٹ سے آرڈر کریں۔ Binance Pay یا USDT سے ادائیگی کریں۔ اکاؤنٹ، کی یا ایکٹیویشن کوڈ خودکار طور پر حاصل کریں — بغیر انتظار۔",
    bn: "আমাদের ওয়েবসাইট বা টেলিগ্রাম বট থেকে অর্ডার করুন। Binance Pay বা USDT দিয়ে পেমেন্ট করুন। অ্যাকাউন্ট, কী বা অ্যাক্টিভেশন কোড স্বয়ংক্রিয়ভাবে পান — অপেক্ষা ছাড়াই।",
    ar: "اطلب من موقعنا أو بوت تيليجرام. ادفع عبر Binance Pay أو USDT. استلم حسابك أو مفتاحك أو رمز التفعيل تلقائيًا دون انتظار.",
  },
  "Auto delivery": { "pt-BR": "Entrega automática", es: "Entrega automática", hi: "ऑटो डिलीवरी", ur: "خودکار ڈیلیوری", bn: "অটো ডেলিভারি", ar: "تسليم آلي" },
  "Crypto payment": { "pt-BR": "Pagamento em cripto", es: "Pago con cripto", hi: "क्रिप्टो भुगतान", ur: "کرپٹو ادائیگی", bn: "ক্রিপ্টো পেমেন্ট", ar: "الدفع بالعملات الرقمية" },
  "Telegram bot": { "pt-BR": "Bot do Telegram", es: "Bot de Telegram", hi: "टेलीग्राम बॉट", ur: "ٹیلیگرام بوٹ", bn: "টেলিগ্রাম বট", ar: "بوت تيليجرام" },
  "Browse Products": { "pt-BR": "Ver produtos", es: "Ver productos", hi: "उत्पाद देखें", ur: "پروڈکٹس دیکھیں", bn: "প্রোডাক্ট দেখুন", ar: "تصفح المنتجات" },
  "Track Order": { "pt-BR": "Rastrear pedido", es: "Rastrear pedido", hi: "ऑर्डर ट्रैक करें", ur: "آرڈر ٹریک کریں", bn: "অর্ডার ট্র্যাক", ar: "تتبع الطلب" },
  Payment: { "pt-BR": "Pagamento", es: "Pago", hi: "भुगतान", ur: "ادائیگی", bn: "পেমেন্ট", ar: "الدفع" },
  Delivery: { "pt-BR": "Entrega", es: "Entrega", hi: "डिलीवरी", ur: "ڈیلیوری", bn: "ডেলিভারি", ar: "التسليم" },
  Checkout: { "pt-BR": "Finalizar compra", es: "Pagar", hi: "चेकआउट", ur: "چیک آؤٹ", bn: "চেকআউট", ar: "إتمام الشراء" },
  "Verifying transaction on-chain…": { "pt-BR": "Verificando a transação na blockchain…", es: "Verificando la transacción en la blockchain…", hi: "ऑन-चेन लेनदेन सत्यापित हो रहा है…", ur: "آن چین ٹرانزیکشن کی تصدیق ہو رہی ہے…", bn: "অন-চেইন লেনদেন যাচাই হচ্ছে…", ar: "جارٍ التحقق من المعاملة على الشبكة…" },
  "Payment confirmed": { "pt-BR": "Pagamento confirmado", es: "Pago confirmado", hi: "भुगतान की पुष्टि हुई", ur: "ادائیگی کی تصدیق ہوگئی", bn: "পেমেন্ট নিশ্চিত হয়েছে", ar: "تم تأكيد الدفع" },
  "Order delivered": { "pt-BR": "Pedido entregue", es: "Pedido entregado", hi: "ऑर्डर डिलीवर हुआ", ur: "آرڈر ڈیلیور ہوگیا", bn: "অর্ডার ডেলিভার হয়েছে", ar: "تم تسليم الطلب" },
  "Pick a plan below — instant delivery after payment.": { "pt-BR": "Escolha um plano abaixo — entrega instantânea após o pagamento.", es: "Elige un plan abajo: entrega instantánea tras el pago.", hi: "नीचे प्लान चुनें — भुगतान के बाद तुरंत डिलीवरी।", ur: "نیچے پلان منتخب کریں — ادائیگی کے بعد فوری ڈیلیوری۔", bn: "নিচে একটি প্ল্যান বেছে নিন — পেমেন্টের পরেই ডেলিভারি।", ar: "اختر خطة بالأسفل — تسليم فوري بعد الدفع." },
  "No exact match yet. Browse the full catalogue for similar products.": { "pt-BR": "Nenhum resultado exato. Veja o catálogo completo para produtos semelhantes.", es: "Sin coincidencia exacta. Explora el catálogo completo para productos similares.", hi: "कोई सटीक मिलान नहीं। समान उत्पादों के लिए पूरा कैटलॉग देखें।", ur: "کوئی مکمل مماثلت نہیں۔ ملتے جلتے پروڈکٹس کے لیے مکمل کیٹلاگ دیکھیں۔", bn: "হুবহু মিল নেই। একই ধরনের প্রোডাক্টের জন্য পুরো ক্যাটালগ দেখুন।", ar: "لا توجد نتيجة مطابقة. تصفح الكتالوج الكامل لمنتجات مشابهة." },
  "Instant Delivery": { "pt-BR": "Entrega instantânea", es: "Entrega instantánea", hi: "तुरंत डिलीवरी", ur: "فوری ڈیلیوری", bn: "ইনস্ট্যান্ট ডেলিভারি", ar: "تسليم فوري" },
  "Secure Crypto Pay": { "pt-BR": "Pagamento cripto seguro", es: "Pago cripto seguro", hi: "सुरक्षित क्रिप्टो भुगतान", ur: "محفوظ کرپٹو ادائیگی", bn: "নিরাপদ ক্রিপ্টো পেমেন্ট", ar: "دفع مشفّر آمن" },
  "24/7 Support": { "pt-BR": "Suporte 24/7", es: "Soporte 24/7", hi: "24/7 सहायता", ur: "24/7 سپورٹ", bn: "২৪/৭ সাপোর্ট", ar: "دعم 24/7" },
  "As soon as your order is confirmed, the account / key is delivered automatically — no waiting.": { "pt-BR": "Assim que o pedido é confirmado, a conta/chave é entregue automaticamente — sem espera.", es: "En cuanto se confirma tu pedido, la cuenta o clave se entrega automáticamente, sin esperas.", hi: "ऑर्डर कन्फर्म होते ही अकाउंट/की स्वतः डिलीवर हो जाती है — कोई इंतज़ार नहीं।", ur: "آرڈر کی تصدیق ہوتے ہی اکاؤنٹ/کی خودکار طور پر ڈیلیور ہو جاتی ہے — بغیر انتظار۔", bn: "অর্ডার নিশ্চিত হওয়ার সঙ্গে সঙ্গেই অ্যাকাউন্ট/কী স্বয়ংক্রিয়ভাবে ডেলিভার হয় — অপেক্ষা নেই।", ar: "بمجرد تأكيد طلبك يتم تسليم الحساب/المفتاح تلقائيًا دون انتظار." },
  "Binance Pay and USDT (BEP20 / TRC20) — every payment is verified automatically.": { "pt-BR": "Binance Pay e USDT (BEP20 / TRC20) — cada pagamento é verificado automaticamente.", es: "Binance Pay y USDT (BEP20 / TRC20): cada pago se verifica automáticamente.", hi: "Binance Pay और USDT (BEP20 / TRC20) — हर भुगतान स्वतः सत्यापित होता है।", ur: "Binance Pay اور USDT (BEP20 / TRC20) — ہر ادائیگی خودکار تصدیق ہوتی ہے۔", bn: "Binance Pay ও USDT (BEP20 / TRC20) — প্রতিটি পেমেন্ট স্বয়ংক্রিয়ভাবে যাচাই হয়।", ar: "Binance Pay وUSDT (BEP20 / TRC20) — يتم التحقق من كل دفعة تلقائيًا." },
  "Our support team is on Telegram 24 hours a day for any issue.": { "pt-BR": "Nossa equipe de suporte está no Telegram 24 horas por dia para qualquer problema.", es: "Nuestro equipo de soporte está en Telegram las 24 horas para cualquier problema.", hi: "हमारी सहायता टीम किसी भी समस्या के लिए 24 घंटे टेलीग्राम पर उपलब्ध है।", ur: "ہماری سپورٹ ٹیم کسی بھی مسئلے کے لیے 24 گھنٹے ٹیلیگرام پر موجود ہے۔", bn: "যেকোনো সমস্যায় আমাদের সাপোর্ট টিম ২৪ ঘণ্টা টেলিগ্রামে আছে।", ar: "فريق الدعم متاح على تيليجرام على مدار 24 ساعة لأي مشكلة." },
};
