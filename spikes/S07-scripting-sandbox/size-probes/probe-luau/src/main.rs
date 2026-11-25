fn main() {
    let lua = mlua::Lua::new();
    lua.sandbox(true).unwrap();
    lua.set_memory_limit(64 * 1024 * 1024).unwrap();
    let v: f64 = lua.load("return 2.0 / 21.0 * 6000.0").eval().unwrap();
    println!("{v:.6}");
}
