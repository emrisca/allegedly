fn main() {
    let mut ema = 6000.0_f64;
    for i in 1..1000 {
        let p = 6000.0 + (i as f64) * 0.25;
        ema = (2.0 / 21.0) * p + (19.0 / 21.0) * ema;
    }
    println!("{:.6}", std::hint::black_box(ema));
}
