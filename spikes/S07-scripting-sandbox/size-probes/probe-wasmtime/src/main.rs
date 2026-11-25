use wasmtime::{Config, Engine, Linker, Module, Store};

fn main() {
    let mut cfg = Config::new();
    cfg.consume_fuel(true);
    let engine = Engine::new(&cfg).unwrap();
    let wasm = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    let module = Module::new(&engine, wasm).unwrap();
    let mut store = Store::new(&engine, ());
    store.set_fuel(1000).unwrap();
    let linker = Linker::new(&engine);
    let _inst = linker.instantiate(&mut store, &module).unwrap();
    println!("ok");
}
