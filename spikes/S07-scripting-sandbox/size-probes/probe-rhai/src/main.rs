fn main() {
    let mut engine = rhai::Engine::new();
    engine.set_max_operations(100_000);
    let v: f64 = engine.eval("2.0 / 21.0 * 6000.0").unwrap();
    println!("{v:.6}");
}
