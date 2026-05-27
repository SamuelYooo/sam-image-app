use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};

const BEIJING_OFFSET_SECS: i128 = 8 * 60 * 60;
const SECS_PER_DAY: i128 = 24 * 60 * 60;

pub fn now_nanos() -> AppResult<u128> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::InvalidData(format!("系统时间错误: {error}")))?
        .as_nanos())
}

pub fn beijing_timestamp_now() -> AppResult<String> {
    beijing_timestamp_from(SystemTime::now())
}

pub fn beijing_timestamp_from(time: SystemTime) -> AppResult<String> {
    let unix_secs = time
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::InvalidData(format!("系统时间错误: {error}")))?
        .as_secs() as i128;
    Ok(format_beijing_unix_seconds(unix_secs))
}

fn format_beijing_unix_seconds(unix_secs: i128) -> String {
    let local_secs = unix_secs + BEIJING_OFFSET_SECS;
    let days = local_secs.div_euclid(SECS_PER_DAY);
    let seconds_of_day = local_secs.rem_euclid(SECS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3600;
    let minute = (seconds_of_day % 3600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}+08:00")
}

fn civil_from_days(days_since_unix_epoch: i128) -> (i128, i128, i128) {
    let z = days_since_unix_epoch + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, UNIX_EPOCH};

    use super::*;

    #[test]
    fn formats_unix_epoch_as_beijing_timestamp() {
        assert_eq!(
            beijing_timestamp_from(UNIX_EPOCH).expect("epoch should format"),
            "1970-01-01T08:00:00+08:00"
        );
    }

    #[test]
    fn formats_utc_day_rollover_as_beijing_timestamp() {
        assert_eq!(
            beijing_timestamp_from(UNIX_EPOCH + Duration::from_secs(16 * 60 * 60))
                .expect("timestamp should format"),
            "1970-01-02T00:00:00+08:00"
        );
    }
}
