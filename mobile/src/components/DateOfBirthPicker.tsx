import { Picker } from "@react-native-picker/picker";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const colors = {
  text: "#17191e",
  muted: "#6c727d",
  border: "#dce0db",
  surface: "#ffffff",
};

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number | undefined, month: number | undefined) {
  if (!month) return 31;
  return new Date(year ?? 2000, month, 0).getDate();
}

export function DateOfBirthPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value?: string) => void;
}) {
  const [parts, setParts] = useState<{ year?: number; month?: number; day?: number }>(() => {
    const [yearText, monthText, dayText] = value?.split("-") ?? [];
    return {
      year: yearText ? Number(yearText) : undefined,
      month: monthText ? Number(monthText) : undefined,
      day: dayText ? Number(dayText) : undefined,
    };
  });
  const { year, month, day } = parts;
  const today = new Date();
  const latestYear = today.getFullYear() - 15;
  const maxDay = daysInMonth(year, month);

  useEffect(() => {
    if (!value) return;
    const [yearText, monthText, dayText] = value.split("-");
    setParts({ year: Number(yearText), month: Number(monthText), day: Number(dayText) });
  }, [value]);

  function update(key: "year" | "month" | "day", selected: string | number) {
    const next = { ...parts, [key]: selected ? Number(selected) : undefined };
    if (next.day && next.day > daysInMonth(next.year, next.month)) next.day = undefined;
    setParts(next);
    if (!next.year || !next.month || !next.day) {
      onChange(undefined);
      return;
    }
    onChange(`${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}`);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Birth date (Month / Day / Year)</Text>
      <View style={styles.row}>
        <Picker
          accessibilityLabel="Birth month"
          selectedValue={month ?? ""}
          onValueChange={(selected: string | number) => update("month", selected)}
          style={styles.picker}
          mode="dropdown"
          dropdownIconColor={colors.muted}
        >
          <Picker.Item label="Month" value="" />
          {months.map((label, index) => (
            <Picker.Item key={label} label={label} value={index + 1} />
          ))}
        </Picker>
        <Picker
          accessibilityLabel="Birth day"
          selectedValue={day ?? ""}
          onValueChange={(selected: string | number) => update("day", selected)}
          style={styles.picker}
          mode="dropdown"
          dropdownIconColor={colors.muted}
        >
          <Picker.Item label="Day" value="" />
          {Array.from({ length: maxDay }, (_, index) => index + 1).map((value) => (
            <Picker.Item key={value} label={String(value)} value={value} />
          ))}
        </Picker>
        <Picker
          accessibilityLabel="Birth year"
          selectedValue={year ?? ""}
          onValueChange={(selected: string | number) => update("year", selected)}
          style={styles.picker}
          mode="dropdown"
          dropdownIconColor={colors.muted}
        >
          <Picker.Item label="Year" value="" />
          {Array.from({ length: latestYear - 1899 }, (_, index) => latestYear - index).map((value) => (
            <Picker.Item key={value} label={String(value)} value={value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 7 },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  picker: { flex: 1, height: 52, color: colors.text },
});
